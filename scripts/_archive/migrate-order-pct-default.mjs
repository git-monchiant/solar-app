import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});

// Find existing default constraint name + drop it
const r1 = await pool.request().query(`
  SELECT dc.name AS constraint_name
  FROM sys.default_constraints dc
  JOIN sys.columns c ON c.default_object_id = dc.object_id
  WHERE c.object_id = OBJECT_ID('dbo.leads') AND c.name = 'order_pct_before'
`);
const oldName = r1.recordset[0]?.constraint_name;
console.log("Existing default constraint:", oldName);

if (oldName) {
  await pool.request().query(`ALTER TABLE leads DROP CONSTRAINT [${oldName}]`);
  console.log("Dropped:", oldName);
}

await pool.request().query(`ALTER TABLE leads ADD CONSTRAINT DF_leads_order_pct_before DEFAULT 100 FOR order_pct_before`);
console.log("Added new default = 100");

const r2 = await pool.request().query(`
  SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME='leads' AND COLUMN_NAME='order_pct_before'
`);
console.log("Verify:", r2.recordset[0]);

await pool.close();
