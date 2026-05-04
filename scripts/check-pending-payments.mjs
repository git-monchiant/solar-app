// One-shot: list pending (un-confirmed) payments rows for inspection.
import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
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
  SELECT id, lead_id, step_no, slip_field, payment_no, amount, confirmed_at
  FROM payments
  WHERE confirmed_at IS NULL AND slip_field LIKE 'order_installment_%'
  ORDER BY lead_id, step_no
`);
console.log(`Pending order_installment_* rows: ${r.recordset.length}`);
console.table(r.recordset);

await pool.close();
