import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT id, activity_type, title, note
  FROM lead_activities
  WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    AND title IS NOT NULL
    AND title NOT LIKE N'ติดต่อได้%'
    AND title NOT LIKE N'ติดต่อไม่ได้%'
    AND title <> N'อื่นๆ'
    AND note IS NOT NULL
  ORDER BY id DESC
`);
console.log(`Unmatched rows with note: ${r.recordset.length}\n`);
for (const row of r.recordset) {
  console.log(`id=${row.id}  [${row.activity_type}]  note="${row.note}"`);
}
await pool.close();
