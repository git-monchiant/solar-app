/**
 * Re-create + link projects directly from sheet col 10 for every lead that
 * currently has project_id = NULL. The earlier "address-like" cleanup was
 * over-eager: it killed legit project names that happened to contain "กม."
 * (e.g. "เสนา วิลเลจ รามอินทรา กม.9").
 */
import sql from "mssql";
import { readFileSync } from "fs";

function parseCSV(text) { const rows=[]; let row=[],field='',q=false; for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1]; if(q){if(c==='"'&&n==='"'){field+='"';i++;}else if(c==='"')q=false;else field+=c;}else{if(c==='"')q=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}else if(c!=='\r')field+=c;}} if(field||row.length){row.push(field);rows.push(row);} return rows;}

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});

const URL2 = 'https://docs.google.com/spreadsheets/d/14Fvt4SJEohqmWOslEoMaGnCV0gRrrjKdh5IRzONKz54/export?format=csv&gid=0';
const csv = await (await fetch(URL2)).text();
const rows = parseCSV(csv);
const data = rows.slice(3).filter(r => r.length > 8 && (r[8] || '').trim());

const trim = (v) => (v||'').toString().trim();

const projects = (await pool.request().query(`SELECT id, name FROM projects`)).recordset;
const findExact = (n) => projects.find(p => trim(p.name) === trim(n)) || null;
async function getOrCreate(name) {
  const n = trim(name);
  if (!n) return null;
  const ex = findExact(n);
  if (ex) return ex;
  const ins = await pool.request()
    .input('name', sql.NVarChar(200), n)
    .query(`INSERT INTO projects (name, is_active) OUTPUT INSERTED.id VALUES (@name, 1)`);
  const created = { id: ins.recordset[0].id, name: n };
  projects.push(created);
  console.log(`  created project "${n}"`);
  return created;
}

const noProjLeads = (await pool.request().query(`
  SELECT id, customer_code FROM leads WHERE project_id IS NULL
`)).recordset;
const codeMap = new Map(noProjLeads.map(l => [l.customer_code, l.id]));

let linked = 0, skipped = 0;
for (const r of data) {
  const code = trim(r[1]);
  if (!codeMap.has(code)) continue;
  const projName = trim(r[10]);
  // Skip the "specify in note" placeholder — those should already have a
  // separate handling via project_note backfill earlier.
  if (!projName || /อื่น/.test(projName)) { skipped++; continue; }
  const proj = await getOrCreate(projName);
  if (!proj) { skipped++; continue; }
  await pool.request()
    .input('id', sql.Int, codeMap.get(code))
    .input('pid', sql.Int, proj.id)
    .query(`UPDATE leads SET project_id = @pid WHERE id = @id`);
  linked++;
}
console.log(`\nlinked: ${linked}  skipped: ${skipped}`);

// Backfill installation_address from project for leads still missing address.
const r = await pool.request().query(`
  UPDATE l
  SET l.installation_address = p.name
  FROM leads l
  JOIN projects p ON p.id = l.project_id
  WHERE (l.installation_address IS NULL OR LTRIM(RTRIM(l.installation_address)) = '')
`);
console.log(`backfilled installation_address from project for ${r.rowsAffected[0]} more leads`);

const final = (await pool.request().query(`
  SELECT
    SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS no_project,
    SUM(CASE WHEN installation_address IS NULL OR LTRIM(RTRIM(installation_address)) = '' THEN 1 ELSE 0 END) AS no_address
  FROM leads
`)).recordset[0];
console.log(`Final: no_project=${final.no_project}  no_address=${final.no_address}`);

await pool.close();
