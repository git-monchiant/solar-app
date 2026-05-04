import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const pool = await sql.connect({
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});

const r = await pool.request().query(`
  SELECT id, step_no, slip_field, doc_no, amount, description,
         CASE WHEN slip_data IS NULL THEN 0 ELSE DATALENGTH(slip_data) END AS slip_bytes,
         confirmed_by, confirmed_at, payment_method, payment_no
  FROM payments WHERE lead_id = 503 ORDER BY id
`);
console.log(`payments: ${r.recordset.length} rows`);
console.table(r.recordset);

const l = await pool.request().query(`
  SELECT id, status, order_total, order_before_paid, order_after_paid,
         install_extra_cost, install_extra_note, install_confirmed, install_completed_at,
         pre_pay_amount, pre_pay_description, pre_pay_token
  FROM leads WHERE id = 503
`);
console.log("\nleads.503 selected fields:");
console.table(l.recordset);

await pool.close();
