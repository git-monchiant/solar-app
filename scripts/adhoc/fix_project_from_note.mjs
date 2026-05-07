/**
 * Backfill leads.project_id from leads.project_note for rows the import skipped.
 * Sheet col 10 is "โครงการอื่นๆ (ระบุในหมายเหตุ)" for many leads — the actual
 * project name lives in col 11 (project_note). The merge import treats anything
 * matching /อื่น/ as no-project, so those leads end up with project_id NULL even
 * though the note has the real value.
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
const norm = (s) => trim(s).replace(/\s+/g, '').replace(/[-–]/g, '');

const projects = (await pool.request().query(`SELECT id, name FROM projects`)).recordset;
const findProjectInMemory = (name) => {
  const n = trim(name);
  if (!n) return null;
  const exact = projects.find(p => p.name.trim() === n);
  if (exact) return exact;
  const key = norm(n);
  return projects.find(p => norm(p.name).includes(key) || key.includes(norm(p.name))) || null;
};
async function findOrCreateProject(name) {
  const n = trim(name);
  if (!n) return null;
  const existing = findProjectInMemory(n);
  if (existing) return existing;
  const ins = await pool.request()
    .input('name', sql.NVarChar(200), n)
    .query(`INSERT INTO projects (name, is_active) OUTPUT INSERTED.id VALUES (@name, 1)`);
  const created = { id: ins.recordset[0].id, name: n };
  projects.push(created);
  return created;
}

const targets = (await pool.request().query(`
  SELECT id, customer_code, full_name, project_note
  FROM leads
  WHERE project_id IS NULL
    AND project_note IS NOT NULL
    AND LTRIM(RTRIM(project_note)) <> ''
`)).recordset;

console.log(`${targets.length} leads with no project but a project_note`);

let matched = 0, created = 0, skipped = 0;
for (const t of targets) {
  // Use the FIRST line of the note — many notes are multi-line ("project / extra context")
  const firstLine = trim(t.project_note.split('\n')[0]);
  // Skip pure free-form notes (timeouts, "ลูกค้าไม่รับโทรศัพท์", etc.)
  if (firstLine.length < 4 || firstLine.length > 80 || /[(]|ลูกค้า|โทร|ติดต่อ|รอ|ไม่/.test(firstLine)) {
    skipped++;
    continue;
  }
  const wasInMemory = !!findProjectInMemory(firstLine);
  const proj = await findOrCreateProject(firstLine);
  if (!proj) { skipped++; continue; }
  await pool.request()
    .input('id', sql.Int, t.id)
    .input('pid', sql.Int, proj.id)
    .query(`UPDATE leads SET project_id = @pid WHERE id = @id`);
  if (wasInMemory) matched++; else created++;
  console.log(`  lead ${t.id} (${t.customer_code}) → project "${proj.name}" ${wasInMemory ? '(matched)' : '(new)'}`);
}

console.log(`\nMATCHED: ${matched}  CREATED: ${created}  SKIPPED (free-form note): ${skipped}`);

await pool.close();
