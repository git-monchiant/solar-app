import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});

// Lead row
const lead = (await pool.request().query(`SELECT id, status, lost_reason, updated_at, created_at FROM leads WHERE id IN (558, 559, 437, 438)`)).recordset;
console.log("Leads:");
for (const r of lead) console.log(`  id=${r.id} status=${r.status} lost_reason="${r.lost_reason}" updated=${r.updated_at?.toISOString?.()}`);

// Recent activities for these leads
console.log("\nActivities (status_change):");
const acts = (await pool.request().query(`
  SELECT TOP 30 lead_id, activity_type, title, old_status, new_status, created_at
  FROM lead_activities
  WHERE lead_id IN (558, 559, 437, 438) AND activity_type = 'status_change'
  ORDER BY created_at DESC
`)).recordset;
for (const r of acts) {
  console.log(`  lead=${r.lead_id}  ${r.old_status} → ${r.new_status}  title="${r.title}"  at=${r.created_at?.toISOString?.()}`);
}
await pool.close();
