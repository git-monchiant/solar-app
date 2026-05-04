import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});

// 1. Drop old default constraint on order_pct_after
const dc = await pool.request().query(`
  SELECT dc.name FROM sys.default_constraints dc
  JOIN sys.columns c ON c.default_object_id = dc.object_id
  WHERE c.object_id = OBJECT_ID('dbo.leads') AND c.name = 'order_pct_after'
`);
const oldName = dc.recordset[0]?.name;
if (oldName) {
  await pool.request().query(`ALTER TABLE leads DROP CONSTRAINT [${oldName}]`);
  console.log("Dropped:", oldName);
}
await pool.request().query(`ALTER TABLE leads ADD CONSTRAINT DF_leads_order_pct_after DEFAULT 0 FOR order_pct_after`);
console.log("Added new default = 0");

// 2. Backfill — set pct_after = 100 - pct_before for rows where sum is wrong
const b = await pool.request().query(`
  UPDATE leads SET order_pct_after = 100 - order_pct_before
  WHERE order_pct_before IS NOT NULL AND (order_pct_after IS NULL OR order_pct_before + order_pct_after <> 100);
  SELECT @@ROWCOUNT AS n
`);
console.log("Backfilled:", b.recordset[0].n);
await pool.close();
