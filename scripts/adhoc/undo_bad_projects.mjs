import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});

// Drop projects whose names look like free-form notes (slashes, "ลูกค้า", "โทร", multi-word with phone vibes).
const bad = (await pool.request().query(`
  SELECT id, name FROM projects
  WHERE name LIKE '%ลูกค้า%' OR name LIKE '%โทร%' OR name LIKE '%/%' OR name LIKE '%ไม่รับ%'
`)).recordset;
console.log(`bad projects (free-form-note-like): ${bad.length}`);
for (const p of bad) console.log(`  ${p.id}: "${p.name}"`);
for (const p of bad) {
  await pool.request().input('pid', sql.Int, p.id).query(`UPDATE leads SET project_id = NULL WHERE project_id = @pid`);
  await pool.request().input('pid', sql.Int, p.id).query(`UPDATE prospects SET project_id = NULL WHERE project_id = @pid`);
  await pool.request().input('pid', sql.Int, p.id).query(`DELETE FROM projects WHERE id = @pid`);
}
console.log(`removed ${bad.length} bad projects`);
await pool.close();
