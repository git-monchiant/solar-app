// Pull recent 401 client errors from prod to triage user reports.
import sql from 'mssql';
const dbArg = process.argv.slice(2).find(a => a.startsWith('--db=')) || '--db=solardb';
const database = dbArg.split('=')[1];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database}\n`);

// Last 24h, status_code = 401 OR message containing "401" / "unauthent"
const r = await pool.request().query(`
  SELECT TOP 30
    e.id, e.created_at, e.user_id, u.username, u.full_name,
    e.source, e.status_code, e.request_url,
    LEFT(e.message, 200) AS message,
    LEFT(e.url, 100) AS page_url,
    LEFT(e.user_agent, 80) AS ua
  FROM client_errors e
  LEFT JOIN users u ON u.id = e.user_id
  WHERE e.created_at >= DATEADD(hour, -48, GETDATE())
    AND (e.status_code = 401 OR e.message LIKE N'%401%' OR e.message LIKE N'%authent%' OR e.message LIKE N'%session%')
  ORDER BY e.created_at DESC
`);
console.log(`Found ${r.recordset.length} entries (last 48h)\n`);
for (const row of r.recordset) {
  console.log(`[${row.created_at?.toISOString?.()}] user=${row.username || `id:${row.user_id}`} src=${row.source} code=${row.status_code}`);
  console.log(`  page : ${row.page_url}`);
  console.log(`  req  : ${row.request_url}`);
  console.log(`  msg  : ${row.message}`);
  console.log(`  ua   : ${row.ua}`);
  console.log('');
}
await pool.close();
