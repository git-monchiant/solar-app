// Remove pending order_before_slip / order_after_slip rows on leads that have
// adopted the new per-installment flow (i.e. order_installments JSON exists).
// The legacy subStep 2 PaymentSection still creates these on mount; this is
// safe to remove because the per-installment flow is the source of truth now.
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
  DELETE p FROM payments p
  INNER JOIN leads l ON l.id = p.lead_id
  WHERE p.confirmed_at IS NULL
    AND p.slip_field IN ('order_before_slip', 'order_after_slip')
    AND l.order_installments IS NOT NULL;
  SELECT @@ROWCOUNT AS removed;
`);
console.log(`Removed legacy pending rows: ${r.recordset[0].removed}`);

const left = await pool.request().query(`
  SELECT id, lead_id, step_no, slip_field, payment_no, amount FROM payments
  WHERE confirmed_at IS NULL ORDER BY lead_id, step_no
`);
console.log(`Remaining pending rows: ${left.recordset.length}`);
console.table(left.recordset);

await pool.close();
