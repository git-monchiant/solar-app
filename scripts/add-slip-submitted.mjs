import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});
const exists = await pool.request().query(`SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='slip_files' AND COLUMN_NAME='submitted_at'`);
if (exists.recordset[0].n === 0) {
  await pool.request().query(`ALTER TABLE slip_files ADD submitted_at DATETIME2 NULL`);
  console.log("ADD slip_files.submitted_at DATETIME2 NULL");
  // Backfill: existing rows treated as already-submitted (unblock current users)
  const r = await pool.request().query(`UPDATE slip_files SET submitted_at = COALESCE(uploaded_at, GETDATE()) WHERE submitted_at IS NULL; SELECT @@ROWCOUNT AS n`);
  console.log("Backfilled", r.recordset[0].n, "existing rows as submitted");
} else {
  console.log("SKIP slip_files.submitted_at (exists)");
}
await pool.close();
