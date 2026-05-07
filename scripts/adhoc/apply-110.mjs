import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/110_prospects_channels.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) await pool.request().query(b);
const r = await pool.request().query(`SELECT TOP 5 id, channel, channels FROM prospects WHERE channels IS NOT NULL`);
console.log('Sample channels rows:', r.recordset);
const counts = await pool.request().query(`
  SELECT
    SUM(CASE WHEN channel IS NOT NULL THEN 1 ELSE 0 END) AS has_channel,
    SUM(CASE WHEN channels IS NOT NULL THEN 1 ELSE 0 END) AS has_channels,
    COUNT(*) AS total
  FROM prospects
`);
console.log('Counts:', counts.recordset[0]);
await pool.close();
