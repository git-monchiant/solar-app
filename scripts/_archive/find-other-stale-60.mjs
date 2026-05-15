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
  SELECT l.id, l.full_name, l.order_total, l.order_pct_before, l.status,
    (SELECT COUNT(*) FROM payments p WHERE p.lead_id = l.id AND p.slip_field LIKE 'order_installment_%' AND p.confirmed_at IS NOT NULL) AS confirmed_inst
  FROM leads l
  WHERE l.order_pct_before = 60 AND l.order_installments IS NOT NULL
`);
console.table(r.recordset);
await pool.close();
