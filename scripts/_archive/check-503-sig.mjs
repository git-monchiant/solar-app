import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});
const r = await pool.request().query(`
  SELECT id, install_customer_signature_url, install_customer_signature_mime,
         CASE WHEN install_customer_signature_data IS NULL THEN 'NULL' ELSE CONCAT('len=', DATALENGTH(install_customer_signature_data)) END AS sig_data
  FROM leads WHERE id = 503
`);
console.log(r.recordset[0]);
await pool.close();
