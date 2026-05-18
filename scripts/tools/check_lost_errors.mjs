import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT TOP 20 created_at, message, status_code, request_url, user_id, stack
  FROM client_errors
  WHERE created_at > DATEADD(hour, -6, GETDATE())
    AND request_url LIKE '%/api/leads/%'
  ORDER BY created_at DESC
`);
for (const row of r.recordset) {
  console.log(`${row.created_at?.toISOString?.()} [${row.status_code}] user=${row.user_id} ${row.request_url}`);
  if (row.stack) console.log(`  stack: ${row.stack.slice(0,300)}`);
}
await pool.close();
