import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const sqlText = fs.readFileSync('sql/112_prospects_source_tag.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) await pool.request().query(b);

const r = await pool.request().query(`
  SELECT
    SUM(CASE WHEN prospect_source IS NOT NULL THEN 1 ELSE 0 END) AS has_source,
    SUM(CASE WHEN tag IS NOT NULL THEN 1 ELSE 0 END) AS has_tag,
    COUNT(*) AS total
  FROM prospects
`);
console.log('Counts:', r.recordset[0]);

const byMix = await pool.request().query(`
  SELECT TOP 5 prospect_source, COUNT(*) AS n
  FROM prospects WHERE prospect_source IS NOT NULL
  GROUP BY prospect_source ORDER BY COUNT(*) DESC
`);
console.log('\nTop sources:', byMix.recordset);
await pool.close();
