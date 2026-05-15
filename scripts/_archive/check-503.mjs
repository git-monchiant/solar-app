import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync("/Users/monchiant/sena-projects/solar-app/.env.local", "utf8");
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
  SELECT id, status, install_confirmed, install_completed_at, install_actual_date,
         install_extra_cost, install_extra_note, order_after_paid, order_before_paid
  FROM leads WHERE id = 503
`);
console.log("Lead 503:");
console.log(r.recordset[0]);

const p = await pool.request().query(`
  SELECT id, slip_field, payment_no, amount, confirmed_at, step_no
  FROM payments WHERE lead_id = 503 ORDER BY step_no
`);
console.log("\nPayments for 503:");
console.table(p.recordset);

await pool.close();
