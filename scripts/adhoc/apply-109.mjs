import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/109_projects_is_pinned.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) await pool.request().query(b);
const r = await pool.request().query(`SELECT id, name, is_pinned FROM projects WHERE is_pinned = 1`);
console.log('Pinned projects:', r.recordset);
await pool.close();
