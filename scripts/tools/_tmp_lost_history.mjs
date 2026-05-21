import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'solardb_dev',
  options: { encrypt: false, trustServerCertificate: true },
});

// Lead IDs of the lost leads with skipped follow-up rows
const leadsR = await pool.request().query(`
  SELECT DISTINCT la.lead_id, l.full_name, l.status
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
    AND l.status IN ('lost','pre_survey')
`);
console.log(`Leads to investigate: ${leadsR.recordset.length}`);

// For each lead, show ALL activity types they've had
for (const lead of leadsR.recordset) {
  const acts = await pool.request().query(`
    SELECT activity_type, COUNT(*) AS n,
           STRING_AGG(LEFT(ISNULL(title, ''), 40), ' | ') AS sample_titles
    FROM lead_activities WHERE lead_id = ${lead.lead_id}
    GROUP BY activity_type ORDER BY MAX(created_at)
  `);
  const types = acts.recordset.map(a => `${a.activity_type}(${a.n})`).join(', ');
  const evidence = acts.recordset.some(a => ['payment_confirmed','presurvey_doc_created','appointment_set','appointment_confirmed','slip_uploaded','slip_submitted'].includes(a.activity_type));
  console.log(`\nLead ${lead.lead_id} [${lead.status}] ${lead.full_name?.slice(0, 20)} — ${evidence ? '⭐ BOOKED-evidence' : 'no evidence'}`);
  console.log(`  types: ${types}`);
}
await pool.close();
