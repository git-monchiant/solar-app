/**
 * Smarter backfill from project_note: distinguish "this is a project name" vs
 * "this is actually an address." Long values containing road/sub-district
 * keywords (ถนน/ซอย/แขวง/เขต/จังหวัด/หมายเลข + ตำบล/อำเภอ) are addresses;
 * everything else short stays as project name.
 *
 * Also undoes the previous backfill where we created projects from full
 * addresses — those projects are renamed→nulled→deleted, the address moves
 * onto leads.installation_address.
 */
import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false },
});

const trim = (v) => (v || '').toString().trim();

// Address-like heuristic: contains common Thai address tokens or starts with
// digits+slash and is long enough.
const isAddressLike = (s) => {
  const v = trim(s);
  if (!v) return false;
  if (v.length > 40) return true;
  return /ซอย|ถนน|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|หมู่ที่|กรุงเทพ|กม\.|กม\s|กม[0-9]/.test(v);
};
// Free-form note (timeouts, follow-up info) — skip entirely.
const isFreeFormNote = (s) => /ลูกค้า|โทร[ก-ฮ]?ศัพท์|ติดต่อ|รอ.*ติดต่อ|วันที่.*\d/.test(trim(s));

// Step 1: rename-mistake cleanup. Find projects that were created with
// address-like names (from the previous backfill) — move their name onto the
// linked leads' installation_address (if blank) and disconnect.
const projects = (await pool.request().query(`SELECT id, name FROM projects`)).recordset;
const badProjects = projects.filter(p => isAddressLike(p.name));
console.log(`projects with address-like names: ${badProjects.length}`);

let movedAddress = 0;
for (const p of badProjects) {
  const linked = (await pool.request()
    .input('pid', sql.Int, p.id)
    .query(`SELECT id, installation_address FROM leads WHERE project_id = @pid`)).recordset;
  for (const l of linked) {
    if (!trim(l.installation_address)) {
      await pool.request()
        .input('id', sql.Int, l.id)
        .input('addr', sql.NVarChar(500), p.name)
        .query(`UPDATE leads SET installation_address = @addr, project_id = NULL WHERE id = @id`);
      movedAddress++;
    } else {
      // Address already set — just disconnect.
      await pool.request()
        .input('id', sql.Int, l.id)
        .query(`UPDATE leads SET project_id = NULL WHERE id = @id`);
    }
  }
  // Drop orphan project. Detach prospects pointing at it first (FK).
  await pool.request().input('pid', sql.Int, p.id).query(`UPDATE prospects SET project_id = NULL WHERE project_id = @pid`);
  await pool.request().input('pid', sql.Int, p.id).query(`DELETE FROM projects WHERE id = @pid`);
}
console.log(`moved ${movedAddress} project names → installation_address; dropped ${badProjects.length} orphan projects`);

// Step 2: for any lead still missing project AND/OR address, mine project_note
const targets = (await pool.request().query(`
  SELECT id, customer_code, full_name, installation_address, project_id, project_note
  FROM leads
  WHERE project_note IS NOT NULL
    AND LTRIM(RTRIM(project_note)) <> ''
    AND (
      project_id IS NULL
      OR installation_address IS NULL
      OR LTRIM(RTRIM(installation_address)) = ''
    )
`)).recordset;
console.log(`\n${targets.length} leads still missing data with a project_note to mine`);

const projectsAfter = (await pool.request().query(`SELECT id, name FROM projects`)).recordset;
const findProj = (n) => {
  const v = trim(n);
  if (!v) return null;
  return projectsAfter.find(p => p.name.trim() === v) || null;
};
async function getOrCreateProject(name) {
  const v = trim(name);
  if (!v) return null;
  const existing = findProj(v);
  if (existing) return existing;
  const ins = await pool.request()
    .input('name', sql.NVarChar(200), v)
    .query(`INSERT INTO projects (name, is_active) OUTPUT INSERTED.id VALUES (@name, 1)`);
  const created = { id: ins.recordset[0].id, name: v };
  projectsAfter.push(created);
  return created;
}

let setAddr = 0, setProj = 0, skipped = 0;
for (const t of targets) {
  const firstLine = trim((t.project_note || '').split('\n')[0]);
  if (!firstLine || isFreeFormNote(firstLine)) { skipped++; continue; }

  const addrMissing = !trim(t.installation_address);
  const projMissing = !t.project_id;

  if (isAddressLike(firstLine)) {
    if (addrMissing) {
      await pool.request()
        .input('id', sql.Int, t.id)
        .input('addr', sql.NVarChar(500), firstLine)
        .query(`UPDATE leads SET installation_address = @addr WHERE id = @id`);
      setAddr++;
      console.log(`  ${t.customer_code}: address ← "${firstLine.slice(0, 60)}"`);
    } else { skipped++; }
  } else {
    if (projMissing && firstLine.length >= 4 && firstLine.length <= 80) {
      const proj = await getOrCreateProject(firstLine);
      if (proj) {
        await pool.request()
          .input('id', sql.Int, t.id)
          .input('pid', sql.Int, proj.id)
          .query(`UPDATE leads SET project_id = @pid WHERE id = @id`);
        setProj++;
        console.log(`  ${t.customer_code}: project ← "${firstLine}"`);
      }
    } else { skipped++; }
  }
}

console.log(`\nADDRESS set: ${setAddr}  PROJECT set: ${setProj}  SKIPPED: ${skipped}`);

const final = (await pool.request().query(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS no_project,
    SUM(CASE WHEN installation_address IS NULL OR LTRIM(RTRIM(installation_address)) = '' THEN 1 ELSE 0 END) AS no_address
  FROM leads
`)).recordset[0];
console.log(`\nFinal: total=${final.total}  no_project=${final.no_project}  no_address=${final.no_address}`);

await pool.close();
