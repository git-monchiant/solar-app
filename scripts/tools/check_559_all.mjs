import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT id, lead_id, activity_type, title, old_status, new_status, note, created_at
  FROM lead_activities
  WHERE lead_id = 559
  ORDER BY created_at DESC
`);
console.log("All activities for lead 559:");
for (const row of r.recordset) {
  console.log(`  ${row.created_at?.toISOString?.()} [${row.activity_type}] title="${row.title}" status:${row.old_status}→${row.new_status} note="${row.note?.slice(0,40) ?? ''}"`);
}
await pool.close();
