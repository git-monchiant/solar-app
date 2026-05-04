import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
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
  UPDATE leads
  SET status = 'install',
      install_completed_at = NULL,
      install_completed_by = NULL
  WHERE id = 503;

  SELECT id, status, install_confirmed, install_completed_at, install_actual_date,
         install_extra_cost, install_extra_note, order_after_paid
  FROM leads WHERE id = 503;
`);
console.log("After revert:");
console.log(r.recordset[0]);
await pool.close();
