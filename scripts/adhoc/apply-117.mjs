import sql from 'mssql';
import fs from 'fs';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

// Show "before" state — count of leads where source='seeker' but the linked prospect
// has a real prospect_source.
const before = await pool.request().query(`
  SELECT COUNT(*) AS n FROM leads l
  INNER JOIN prospects p ON p.lead_id = l.id
  WHERE l.source = 'seeker' AND p.prospect_source IS NOT NULL AND p.prospect_source <> ''
`);
console.log("leads to backfill:", before.recordset[0].n);

const sqlText = fs.readFileSync('sql/117_backfill_leads_source.sql', 'utf8');
const batches = sqlText.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
for (const b of batches) {
  try { await pool.request().query(b); }
  catch (e) { console.error('batch failed:', b.slice(0, 80), '\n→', e.message); }
}

// Sample the result
const sample = await pool.request().query(`
  SELECT TOP 10 l.id, l.source, p.prospect_source, l.tag, p.tag AS prospect_tag
  FROM leads l
  INNER JOIN prospects p ON p.lead_id = l.id
  WHERE p.prospect_source IS NOT NULL
  ORDER BY l.id DESC
`);
console.log('\nSample leads with linked prospects:', sample.recordset);

const lead611 = await pool.request().query(`SELECT id, source, tag FROM leads WHERE id = 611`);
console.log('\nLead 611 after backfill:', lead611.recordset[0]);
await pool.close();
