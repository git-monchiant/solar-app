import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT activity_type, title, COUNT(*) as n
  FROM lead_activities
  WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    AND title IS NOT NULL
  GROUP BY activity_type, title
  ORDER BY n DESC
`);
for (const row of r.recordset) console.log(`${row.n.toString().padStart(4)}  [${row.activity_type}]  ${row.title}`);
await pool.close();
