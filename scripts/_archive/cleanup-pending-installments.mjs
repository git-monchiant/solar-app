// Cleanup pending order_installment_* payments rows that are either
//   - duplicates for the same (lead, step_no, slip_field) — keep latest only
//   - orphans whose installment index >= current installment count
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

// 1. Drop duplicates — keep the highest id per (lead_id, step_no, slip_field) for pending rows.
const dups = await pool.request().query(`
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY lead_id, step_no, slip_field ORDER BY id DESC
    ) AS rn
    FROM payments
    WHERE confirmed_at IS NULL
  )
  DELETE FROM ranked WHERE rn > 1;
  SELECT @@ROWCOUNT AS removed;
`);
console.log(`Removed duplicate pending rows: ${dups.recordset[0].removed}`);

// 2. Drop orphans — installment index >= current installments count on the lead.
const orphans = await pool.request().query(`
  DECLARE @removed INT = 0;
  DELETE p
  FROM payments p
  INNER JOIN leads l ON l.id = p.lead_id
  WHERE p.confirmed_at IS NULL
    AND p.slip_field LIKE 'order_installment_%'
    AND TRY_CAST(SUBSTRING(p.slip_field, LEN('order_installment_') + 1, 10) AS INT) >=
        ISNULL((
          SELECT COUNT(*)
          FROM OPENJSON(l.order_installments)
        ), 0);
  SELECT @@ROWCOUNT AS removed;
`);
console.log(`Removed orphan pending rows: ${orphans.recordset[0].removed}`);

// 3. Show what's left
const left = await pool.request().query(`
  SELECT id, lead_id, step_no, slip_field, payment_no, amount
  FROM payments
  WHERE confirmed_at IS NULL AND slip_field LIKE 'order_installment_%'
  ORDER BY lead_id, step_no
`);
console.log(`Remaining pending rows: ${left.recordset.length}`);
console.table(left.recordset);

await pool.close();
