// One-shot: convert lead_activities #432 (saved before loan_followup tagging)
// into a proper loan-followup record on lead 503 งวดที่ 2 (the loan row).
import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
};

const pool = await sql.connect(config);
const r = await pool.request().query(`
  UPDATE lead_activities
  SET activity_type = 'loan_followup', title = N'[งวดที่ 2] โทร'
  WHERE id = 432;
  SELECT id, activity_type, title, note FROM lead_activities WHERE id = 432;
`);
console.table(r.recordset);
await pool.close();
