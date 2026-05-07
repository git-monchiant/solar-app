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

console.log("== Lead 548 ==");
const lead = await pool.request().query(`
  SELECT id, pre_doc_no, full_name,
         pre_total_price, order_total, install_extra_cost,
         order_pct_before, order_pct_after,
         order_installments, order_before_paid, order_after_paid,
         payment_confirmed
  FROM leads WHERE id = 548
`);
console.table(lead.recordset);

const ordIns = lead.recordset[0]?.order_installments;
if (ordIns) {
  console.log("\n== order_installments (parsed) ==");
  try { console.table(JSON.parse(ordIns)); }
  catch { console.log(ordIns); }
}

console.log("\n== payments for lead 548 ==");
const pays = await pool.request().query(`
  SELECT id, step_no, slip_field, doc_no, amount, description,
         confirmed_at, payment_no, ref1
  FROM payments WHERE lead_id = 548
  ORDER BY step_no, id
`);
console.table(pays.recordset);

await pool.close();
