import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/119_retire_old_zones.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) {
  try { await pool.request().query(b); }
  catch (e) { console.error('batch failed:', b.slice(0, 80), '\n→', e.message); }
}
const r = await pool.request().query(`SELECT id, name, color, is_active FROM zones ORDER BY id`);
console.log('Zones after migration:'); console.table(r.recordset);
const ld = await pool.request().query(`SELECT zone, COUNT(*) AS n FROM leads WHERE zone IS NOT NULL GROUP BY zone ORDER BY n DESC`);
console.log('Lead zone counts:'); console.table(ld.recordset);
await pool.close();
