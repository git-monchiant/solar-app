import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});
const r = await pool.request().query(`
  SELECT id, lead_id, step_no, slip_field, doc_no, amount, confirmed_at,
    DATALENGTH(slip_data) AS slip_bytes_1,
    DATALENGTH(slip_data_2) AS slip_bytes_2
  FROM payments WHERE lead_id = 516 ORDER BY step_no
`);
console.table(r.recordset);
await pool.close();
