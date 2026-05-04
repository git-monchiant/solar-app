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
  SELECT COLUMN_NAME, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME='leads' AND COLUMN_NAME IN ('order_pct_before','order_pct_after')
`);
console.table(r.recordset);
const c = await pool.request().query(`
  SELECT COUNT(*) AS bad FROM leads WHERE order_pct_before + order_pct_after <> 100 AND (order_pct_before IS NOT NULL OR order_pct_after IS NOT NULL)
`);
console.log("Leads with mismatched sum:", c.recordset[0].bad);
await pool.close();
