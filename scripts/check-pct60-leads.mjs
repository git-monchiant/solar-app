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
  SELECT COUNT(*) as n FROM leads
  WHERE order_pct_before = 60 AND order_installments IS NULL AND order_total IS NULL
`);
const r2 = await pool.request().query(`
  SELECT COUNT(*) as n FROM leads
  WHERE order_pct_before = 60 AND (order_installments IS NOT NULL OR order_total IS NOT NULL)
`);
console.log("Untouched leads with default 60 (order_total null + installments null):", r.recordset[0].n);
console.log("Leads with 60 + has order_total or installments (likely intentional):", r2.recordset[0].n);
await pool.close();
