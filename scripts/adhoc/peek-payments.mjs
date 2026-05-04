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

const cols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'payments'
  ORDER BY ORDINAL_POSITION
`);
console.log("=== payments columns ===");
console.table(cols.recordset);

const cnt = await pool.request().query(`SELECT COUNT(*) AS total FROM payments`);
console.log(`Total rows: ${cnt.recordset[0].total}`);

const recent = await pool.request().query(`
  SELECT TOP 20 *
  FROM payments
  ORDER BY id DESC
`);
console.log("\n=== latest 20 ===");
console.table(recent.recordset);

await pool.close();
