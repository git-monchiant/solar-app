import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});

const cols = [
  ["slip_amount", "DECIMAL(12,2) NULL"],
  ["slip_ref1", "NVARCHAR(50) NULL"],
  ["slip_ref2", "NVARCHAR(50) NULL"],
  ["slip_trans_id", "NVARCHAR(50) NULL"],
  ["slip_datetime", "DATETIME2 NULL"],
];

for (const tbl of ["slip_files", "payments"]) {
  for (const [name, type] of cols) {
    const exists = await pool.request().query(`
      SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tbl}' AND COLUMN_NAME = '${name}'
    `);
    if (exists.recordset[0].n > 0) {
      console.log(`SKIP ${tbl}.${name} (exists)`);
      continue;
    }
    await pool.request().query(`ALTER TABLE ${tbl} ADD ${name} ${type}`);
    console.log(`ADD  ${tbl}.${name} ${type}`);
  }
}
await pool.close();
