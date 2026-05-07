import sql from "mssql";
import { readFileSync } from "fs";

function parseCSV(text) { const rows=[]; let row=[],field='',q=false; for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1]; if(q){if(c==='"'&&n==='"'){field+='"';i++;}else if(c==='"')q=false;else field+=c;}else{if(c==='"')q=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}else if(c!=='\r')field+=c;}} if(field||row.length){row.push(field);rows.push(row);} return rows;}

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pool = await sql.connect({ server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT||"1433"), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME||"solardb", options: { trustServerCertificate: true, encrypt: false }});

const URL2 = 'https://docs.google.com/spreadsheets/d/14Fvt4SJEohqmWOslEoMaGnCV0gRrrjKdh5IRzONKz54/export?format=csv&gid=0';
const csv = await (await fetch(URL2)).text();
const rows = parseCSV(csv);
const data = rows.slice(3).filter(r => r.length > 8 && (r[8] || '').trim());

const noProj = (await pool.request().query(`
  SELECT TOP 8 customer_code FROM leads WHERE project_id IS NULL ORDER BY id
`)).recordset.map(r => r.customer_code);

console.log("Sheet col 10/11 for sample no-project leads:");
for (const code of noProj) {
  const r = data.find(r => (r[1]||'').trim() === code);
  if (!r) continue;
  console.log(`${code}:`);
  console.log(`  col10(project): "${r[10]}"`);
  console.log(`  col11(note):    "${r[11]}"`);
}
await pool.close();
