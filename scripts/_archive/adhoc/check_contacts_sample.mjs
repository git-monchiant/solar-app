import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

console.log('=== Houses with >1 contact (top 10) ===');
const multi = await pool.request().query(`
  SELECT TOP 10 project_id, house_number, full_name, phone, contacts
  FROM prospects
  WHERE contacts IS NOT NULL
    AND (SELECT COUNT(*) FROM OPENJSON(contacts)) > 1
  ORDER BY (SELECT COUNT(*) FROM OPENJSON(contacts)) DESC
`);
for (const r of multi.recordset) {
  console.log(`#${r.project_id} ${r.house_number}  primary=${r.full_name} / ${r.phone}`);
  console.log(`   ${r.contacts}`);
}

console.log('\n=== Per-project contact count distribution ===');
const dist = await pool.request().query(`
  SELECT project_id,
    COUNT(*) AS houses,
    SUM(CASE WHEN (SELECT COUNT(*) FROM OPENJSON(contacts)) > 1 THEN 1 ELSE 0 END) AS multi_contact,
    MAX((SELECT COUNT(*) FROM OPENJSON(contacts))) AS max_contacts
  FROM prospects
  WHERE contacts IS NOT NULL
  GROUP BY project_id
  ORDER BY project_id
`);
for (const r of dist.recordset) {
  console.log(`project #${r.project_id}: ${r.houses} houses, ${r.multi_contact} with >1 contact, max=${r.max_contacts}`);
}
await pool.close();
