// One-shot migration: rename quotation_installments → order_installments.
// Run: node scripts/migrate-order-installments.mjs
import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
};

const pool = await sql.connect(config);

const hasOld = await pool.request().query(`
  SELECT 1 AS x FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'quotation_installments'
`);
const hasNew = await pool.request().query(`
  SELECT 1 AS x FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'order_installments'
`);

if (hasNew.recordset.length > 0) {
  console.log("order_installments already exists.");
} else if (hasOld.recordset.length > 0) {
  await pool.request().query(`EXEC sp_rename 'dbo.leads.quotation_installments', 'order_installments', 'COLUMN'`);
  console.log("Renamed quotation_installments → order_installments");
} else {
  await pool.request().query(`ALTER TABLE leads ADD order_installments NVARCHAR(MAX) NULL`);
  console.log("Added leads.order_installments");
}

await pool.close();
