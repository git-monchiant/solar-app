import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});
const r = await pool.request().query(`
  SELECT
    OBJECT_NAME(fkc.parent_object_id) AS table_name,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS col
  FROM sys.foreign_key_columns fkc
  JOIN sys.foreign_keys fk ON fk.object_id = fkc.constraint_object_id
  WHERE OBJECT_NAME(fkc.referenced_object_id) = 'leads'
  ORDER BY table_name
`);
console.table(r.recordset);
await pool.close();
