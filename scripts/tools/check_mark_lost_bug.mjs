import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});

console.log("=== leads with lost_reason but status != 'lost' ===");
const r1 = await pool.request().query(`
  SELECT id, status, lost_reason, updated_at
  FROM leads
  WHERE lost_reason IS NOT NULL
    AND status <> 'lost'
  ORDER BY updated_at DESC
`);
for (const row of r1.recordset) {
  console.log(`id=${row.id}  status=${row.status}  lost_reason="${row.lost_reason?.slice(0,40)}"  updated=${row.updated_at?.toISOString?.()}`);
}

console.log(`\nTotal: ${r1.recordset.length}`);

console.log("\n=== recent leads with status='lost' (last 24h) ===");
const r2 = await pool.request().query(`
  SELECT id, status, lost_reason, updated_at
  FROM leads
  WHERE status = 'lost' AND updated_at > DATEADD(hour, -24, GETDATE())
  ORDER BY updated_at DESC
`);
for (const row of r2.recordset) {
  console.log(`id=${row.id}  updated=${row.updated_at?.toISOString?.()}  reason="${row.lost_reason?.slice(0,40)}"`);
}
console.log(`Total: ${r2.recordset.length}`);

await pool.close();
