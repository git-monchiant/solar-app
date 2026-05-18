import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT TOP 50 activity_type, title, note, follow_up_date, created_at
  FROM lead_activities
  WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    AND title IS NOT NULL
    AND (title NOT LIKE N'ติดต่อได้%' AND title NOT LIKE N'ติดต่อไม่ได้%' AND title <> N'อื่นๆ')
  ORDER BY created_at DESC
`);
for (const row of r.recordset) {
  console.log(`[${row.activity_type}] title="${row.title}" | note=${row.note?.slice(0,80) ?? 'NULL'} | next=${row.follow_up_date ?? '-'}`);
}
await pool.close();
