import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT title, COUNT(*) as n
  FROM lead_activities
  WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    AND (title LIKE N'ติดต่อได้%' OR title LIKE N'ติดต่อไม่ได้%' OR title = N'อื่นๆ')
  GROUP BY title
  ORDER BY n DESC
`);
console.log("Structured titles in solardb_dev:");
for (const row of r.recordset) console.log(`  ${row.n.toString().padStart(4)}  ${row.title}`);
await pool.close();
