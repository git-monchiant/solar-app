import sql from 'mssql';
const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

// If lead has booking (pre_slip_url paid OR status past pre_survey),
// any generic-title call/visit/line activity for that lead is upgraded
// to "ติดต่อได้ - Sale เสนอขาย" — the sale offer must have happened
// for the booking to land.
const candidates = await pool.request().query(`
  SELECT la.id, la.lead_id, l.full_name, l.status, la.title
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
    AND (
      l.status IN ('pre_survey-02','survey','quote','order','install','warranty','gridtie','closed')
      OR EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = l.id
                   AND p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL)
    )
`);
console.table(candidates.recordset.map(r => ({
  id: r.id, lead: r.lead_id, name: r.full_name?.slice(0, 25), status: r.status, old: r.title,
})));
console.log(`Would update ${candidates.recordset.length} rows → "ติดต่อได้ - Sale เสนอขาย"`);

if (!execute) { console.log('\nDry-run only — pass --yes to apply.'); await pool.close(); process.exit(0); }

const result = await pool.request().query(`
  UPDATE la SET title = N'ติดต่อได้ - Sale เสนอขาย'
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
    AND (
      l.status IN ('pre_survey-02','survey','quote','order','install','warranty','gridtie','closed')
      OR EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = l.id
                   AND p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL)
    )
`);
console.log(`OK — updated ${result.rowsAffected[0]} rows`);
await pool.close();
