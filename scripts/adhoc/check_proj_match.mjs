import sql from "mssql";
import { readFileSync } from "fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});

const r = await pool.request().query(`SELECT id, name FROM projects WHERE name LIKE N'%รามอินทรา%' OR name LIKE N'%กม.9%' OR name LIKE N'%กม.๙%' OR name LIKE N'%วิลเลจ%' ORDER BY id`);
console.log("Projects matching รามอินทรา/วิลเลจ:");
console.table(r.recordset);

const all = await pool.request().query(`SELECT COUNT(*) AS n FROM projects`);
console.log(`Total projects: ${all.recordset[0].n}`);
await pool.close();
