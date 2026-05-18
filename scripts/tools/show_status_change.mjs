import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT TOP 5 id, lead_id, activity_type, title, note, old_status, new_status, created_by, created_at
  FROM lead_activities
  WHERE activity_type = 'status_change'
  ORDER BY created_at DESC
`);
console.log("Recent status_change rows in solardb_dev:\n");
for (const row of r.recordset) {
  console.log(JSON.stringify({
    id: row.id,
    lead_id: row.lead_id,
    activity_type: row.activity_type,
    title: row.title,
    note: row.note,
    old_status: row.old_status,
    new_status: row.new_status,
    created_by: row.created_by,
    created_at: row.created_at?.toISOString?.(),
  }, null, 2));
  console.log("---");
}
await pool.close();
