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
  SELECT id, lead_id, slip_field, amount, confirmed_at,
    CAST(CASE WHEN DATALENGTH(slip_data) > 0 OR DATALENGTH(slip_data_2) > 0 THEN 1 ELSE 0 END AS BIT) AS has_slip
  FROM payments WHERE confirmed_at IS NULL ORDER BY lead_id
`);
console.table(r.recordset);
await pool.close();
