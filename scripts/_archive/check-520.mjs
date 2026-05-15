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
  SELECT id, status, order_total, order_pct_before, order_installments FROM leads WHERE id = 520
`);
console.log(r.recordset[0]);
const p = await pool.request().query(`
  SELECT id, slip_field, amount, confirmed_at FROM payments WHERE lead_id = 520 ORDER BY step_no
`);
console.table(p.recordset);
await pool.close();
