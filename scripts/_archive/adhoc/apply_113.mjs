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

const sqlText = readFileSync(new URL("../../sql/113_payments_created_at.sql", import.meta.url), "utf8");
const batches = sqlText.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(Boolean);
for (const b of batches) {
  await pool.request().batch(b);
  console.log("✓ batch ok");
}

const r = await pool.request().query(`
  SELECT TOP 5 id, created_at, confirmed_at, lead_id, slip_field, amount
  FROM payments ORDER BY id DESC
`);
console.table(r.recordset);

await pool.close();
