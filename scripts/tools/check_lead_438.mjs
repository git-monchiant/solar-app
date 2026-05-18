import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT id, activity_type, title, note, created_at, follow_up_date
  FROM lead_activities
  WHERE lead_id = 438
  ORDER BY created_at DESC
`);
for (const row of r.recordset) {
  console.log(`[${row.activity_type}] title="${row.title}" note=${JSON.stringify(row.note?.slice(0,60))} created=${row.created_at} nextfu=${row.follow_up_date}`);
}
await pool.close();
