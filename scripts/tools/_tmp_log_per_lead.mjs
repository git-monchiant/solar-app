import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'solardb_dev',
  options: { encrypt: false, trustServerCertificate: true },
});

// Distinct leads in the 57 remaining set
const leadsR = await pool.request().query(`
  SELECT DISTINCT la.lead_id, l.full_name, l.status, l.lost_reason
  FROM lead_activities la
  INNER JOIN leads l ON l.id = la.lead_id
  LEFT JOIN (
    SELECT DISTINCT lead_id FROM payments
    WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
  ) bk ON bk.lead_id = la.lead_id
  WHERE la.activity_type IN ('call','visit','line','other')
    AND (la.title IN ('Called customer','Visited customer','Contacted via LINE','Other contact')
         OR la.title LIKE 'Scheduled follow-up%')
    AND bk.lead_id IS NULL
    AND l.status NOT IN ('pre_survey-02','survey','quote','order','install','warranty','gridtie','closed')
    AND NOT (l.status = 'lost' AND (
      l.lost_reason LIKE N'ลูกค้าไม่สนใจ%'
      OR l.lost_reason LIKE N'ปิดการขายไม่สำเร็จ%'
      OR l.lost_reason LIKE N'ความพร้อม%'
      OR l.lost_reason LIKE N'สินเชื่อ%'
    ))
  ORDER BY l.status, la.lead_id
`);

console.log(`Distinct leads to inspect: ${leadsR.recordset.length}\n`);

for (const lead of leadsR.recordset) {
  const acts = await pool.request().query(`
    SELECT activity_type, title, SUBSTRING(ISNULL(note,''),1,40) AS note, created_at
    FROM lead_activities WHERE lead_id = ${lead.lead_id}
    ORDER BY created_at
  `);
  console.log(`\n━━━ Lead ${lead.lead_id} [${lead.status}${lead.lost_reason ? ` · ${lead.lost_reason.slice(0,25)}` : ''}] ${lead.full_name?.slice(0,25)} (${acts.recordset.length} acts) ━━━`);
  for (const a of acts.recordset) {
    const t = new Date(a.created_at).toISOString().slice(5,16).replace('T',' ');
    console.log(`  ${t} · ${a.activity_type.padEnd(20)} · ${(a.title||'').slice(0,40)}${a.note ? ` — "${a.note}"` : ''}`);
  }
}
await pool.close();
