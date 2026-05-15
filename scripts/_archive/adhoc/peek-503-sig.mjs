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

// Find any column containing 'sign' on leads
const cols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads' AND COLUMN_NAME LIKE '%sign%'
  ORDER BY ORDINAL_POSITION
`);
console.log("signature columns on leads:");
console.table(cols.recordset);

// Read those columns for lead 503
const sigCols = cols.recordset.map((c) => c.COLUMN_NAME);
if (sigCols.length) {
  const sel = sigCols
    .map((n) => {
      // For varbinary, return DATALENGTH instead of raw bytes
      const isBin = cols.recordset.find((c) => c.COLUMN_NAME === n)?.DATA_TYPE === "varbinary";
      return isBin ? `DATALENGTH([${n}]) AS [${n}_bytes]` : `[${n}]`;
    })
    .join(", ");
  const r = await pool.request().query(`SELECT ${sel} FROM leads WHERE id = 503`);
  console.log("\nlead 503 signature fields:");
  for (const [k, v] of Object.entries(r.recordset[0] || {})) {
    console.log(`  ${k}: ${v ?? "null"}`);
  }
}

// Also check signatures table if exists
const tbl = await pool.request().query(`
  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE='BASE TABLE' AND (TABLE_NAME LIKE '%signature%' OR TABLE_NAME LIKE '%sign%')
`);
console.log("\nsignature tables:", tbl.recordset.map((t) => t.TABLE_NAME).join(", ") || "(none)");
for (const t of tbl.recordset) {
  try {
    const has = await pool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' AND COLUMN_NAME='lead_id'
    `);
    if (has.recordset.length) {
      const r = await pool.request().query(`
        SELECT * FROM [${t.TABLE_NAME}] WHERE lead_id = 503
      `);
      if (r.recordset.length) {
        console.log(`\n[${t.TABLE_NAME}] for lead 503: ${r.recordset.length} rows`);
        // Trim binary fields
        for (const row of r.recordset) {
          for (const k of Object.keys(row)) {
            if (Buffer.isBuffer(row[k])) row[k] = `<${row[k].length} bytes>`;
          }
        }
        console.table(r.recordset);
      }
    }
  } catch {}
}

await pool.close();
