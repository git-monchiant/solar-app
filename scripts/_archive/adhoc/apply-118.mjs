import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/118_add_5_zones.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) {
  try { await pool.request().query(b); }
  catch (e) { console.error('batch failed:', b.slice(0, 80), '\n→', e.message); }
}
const r = await pool.request().query(`SELECT id, name, color, is_active FROM zones ORDER BY id`);
console.table(r.recordset);
await pool.close();
