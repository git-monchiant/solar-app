import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});

// Copy linked project name into installation_address whenever it's blank.
// Project name is what users typically know the location by — better than nothing.
const r = await pool.request().query(`
  UPDATE l
  SET l.installation_address = p.name
  FROM leads l
  JOIN projects p ON p.id = l.project_id
  WHERE (l.installation_address IS NULL OR LTRIM(RTRIM(l.installation_address)) = '')
`);
console.log(`filled installation_address from project for ${r.rowsAffected[0]} leads`);

const final = (await pool.request().query(`
  SELECT
    SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS no_project,
    SUM(CASE WHEN installation_address IS NULL OR LTRIM(RTRIM(installation_address)) = '' THEN 1 ELSE 0 END) AS no_address
  FROM leads
`)).recordset[0];
console.log(`Final: no_project=${final.no_project}  no_address=${final.no_address}`);
await pool.close();
