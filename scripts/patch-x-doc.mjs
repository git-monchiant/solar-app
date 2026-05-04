import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
});

const rows = await pool.request().query(`
  SELECT p.id, p.lead_id, p.doc_no, l.pre_doc_no, l.order_installments
  FROM payments p
  JOIN leads l ON l.id = p.lead_id
  WHERE p.doc_no LIKE '%-X'
`);

for (const row of rows.recordset) {
  let n = 0;
  try {
    const arr = row.order_installments ? JSON.parse(row.order_installments) : [];
    n = Array.isArray(arr) ? arr.length : 0;
  } catch {}
  const newDocNo = `${row.pre_doc_no}-${n + 1}`;
  await pool.request()
    .input("id", sql.Int, row.id)
    .input("doc", sql.NVarChar(100), newDocNo)
    .query(`UPDATE payments SET doc_no = @doc WHERE id = @id`);
  console.log(`payment ${row.id} (lead ${row.lead_id}): ${row.doc_no} → ${newDocNo}`);
}
await pool.close();
