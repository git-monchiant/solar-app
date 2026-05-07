import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/113_rename_channel_columns.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) {
  try { await pool.request().query(b); }
  catch (e) { console.error('batch failed:', b.slice(0, 80), '\n→', e.message); }
}
const cols = await pool.request().query(`
  SELECT name FROM sys.columns
  WHERE object_id = OBJECT_ID('prospects') AND name IN ('channel','channels','prospect_source','tag')
  ORDER BY name
`);
console.log('Channel-related columns now:', cols.recordset.map(c => c.name));

const r = await pool.request().query(`
  SELECT TOP 5 id, prospect_source, tag FROM prospects WHERE prospect_source IS NOT NULL
`);
console.log('\nSample rows:', r.recordset);
await pool.close();
