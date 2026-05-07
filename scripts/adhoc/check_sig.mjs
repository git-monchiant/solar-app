import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});
const r = await pool.request().query(`SELECT TABLE_NAME, COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('signature_blobs','user_signatures') GROUP BY TABLE_NAME`);
console.table(r.recordset);
const counts = await pool.request().query(`SELECT 
  (SELECT COUNT(*) FROM signature_blobs) AS sig_blobs_total,
  (SELECT COUNT(*) FROM lead_activities) AS la_total,
  (SELECT COUNT(*) FROM payments) AS pay_total,
  (SELECT COUNT(*) FROM slip_files) AS sf_total
`);
console.table(counts.recordset);
await pool.close();
