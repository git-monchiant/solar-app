import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/122_calendar_blocks_team.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) {
  try { await pool.request().query(b); }
  catch (e) { console.error('batch failed:', b.slice(0, 80), '\n→', e.message); }
}
const r = await pool.request().query(`SELECT c.name, t.name AS type_name, c.max_length FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id WHERE object_id = OBJECT_ID('calendar_blocks') AND c.name = 'team'`);
console.log('team column:'); console.table(r.recordset);
await pool.close();
