import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/111_prospects_project_alias.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) await pool.request().query(b);
const cols = await pool.request().query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name IN ('project_name','project_alias')`);
console.log('Columns:', cols.recordset.map(c => c.name));
await pool.close();
