import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});

// Target: phone 0819276464, status pre_survey-01 (สองหลังที่ user ถอย lost มา)
const PHONE = "0819276464";

const before = await pool.request().input("phone", sql.NVarChar, PHONE).query(`
  SELECT id, house_number, status, full_name FROM leads
  WHERE phone = @phone AND status = 'pre_survey-01'
`);
console.log("BEFORE:");
console.table(before.recordset);

if (before.recordset.length === 0) {
  console.log("ไม่พบ lead ที่ต้องแก้ — exit");
  await pool.close();
  process.exit(0);
}

const upd = await pool.request().input("phone", sql.NVarChar, PHONE).query(`
  UPDATE leads SET status = 'pre_survey', updated_at = GETDATE()
  WHERE phone = @phone AND status = 'pre_survey-01'
`);
console.log(`UPDATED ${upd.rowsAffected[0]} rows`);

const after = await pool.request().input("phone", sql.NVarChar, PHONE).query(`
  SELECT id, house_number, status, full_name FROM leads
  WHERE phone = @phone
`);
console.log("AFTER:");
console.table(after.recordset);

await pool.close();
