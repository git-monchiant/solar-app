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

const pays = await pool.request().query(`
  SELECT id, lead_id, step_no, slip_field, doc_no, amount, description,
         CASE WHEN slip_data IS NULL THEN 0 ELSE DATALENGTH(slip_data) END AS slip_bytes,
         confirmed_by, confirmed_at, ref1, payment_method, payment_no
  FROM payments
  WHERE lead_id = 503
  ORDER BY id
`);
console.log(`=== payments (${pays.recordset.length} rows) ===`);
console.table(pays.recordset);

const cols = await pool.request().query(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads'
    AND (
      COLUMN_NAME LIKE 'order%'
      OR COLUMN_NAME LIKE 'pre_%'
      OR COLUMN_NAME LIKE 'install%'
      OR COLUMN_NAME LIKE '%payment%'
      OR COLUMN_NAME IN ('id','status','customer_name','price','total_price')
    )
  ORDER BY ORDINAL_POSITION
`);
const colNames = cols.recordset.map((c) => c.COLUMN_NAME);
console.log(`\n=== leads cols (${colNames.length}) ===`);
console.log(colNames.join(", "));

if (colNames.length) {
  const sel = colNames.map((n) => `[${n}]`).join(", ");
  const r = await pool.request().query(`SELECT ${sel} FROM leads WHERE id = 503`);
  console.log("\n=== lead 503 ===");
  for (const [k, v] of Object.entries(r.recordset[0] || {})) {
    if (v !== null && v !== undefined && v !== "") console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
}

const tbls = await pool.request().query(`
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE = 'BASE TABLE'
    AND (TABLE_NAME LIKE '%install%' OR TABLE_NAME LIKE '%order%' OR TABLE_NAME = 'lead_payments')
  ORDER BY TABLE_NAME
`);
console.log(`\n=== related tables ===`);
console.log(tbls.recordset.map((t) => t.TABLE_NAME).join(", "));

for (const t of tbls.recordset) {
  try {
    const has = await pool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${t.TABLE_NAME}' AND COLUMN_NAME = 'lead_id'
    `);
    if (has.recordset.length) {
      const rows = await pool.request().query(`SELECT * FROM [${t.TABLE_NAME}] WHERE lead_id = 503`);
      if (rows.recordset.length) {
        console.log(`\n=== ${t.TABLE_NAME} (${rows.recordset.length}) ===`);
        console.table(rows.recordset);
      }
    }
  } catch {}
}

await pool.close();
