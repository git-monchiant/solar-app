import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});

const counts = await pool.request().query(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS no_project,
    SUM(CASE WHEN installation_address IS NULL OR LTRIM(RTRIM(installation_address)) = '' THEN 1 ELSE 0 END) AS no_address,
    SUM(CASE WHEN customer_code IS NULL THEN 1 ELSE 0 END) AS no_code
  FROM leads
`);
console.log("Counts:");
console.table(counts.recordset);

const samples = await pool.request().query(`
  SELECT TOP 10 id, customer_code, full_name, project_id, project_note, installation_address
  FROM leads
  WHERE project_id IS NULL OR installation_address IS NULL OR LTRIM(RTRIM(installation_address)) = ''
  ORDER BY id
`);
console.log("\nSamples:");
console.table(samples.recordset);

await pool.close();
