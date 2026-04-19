import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});
const r = await pool.request().query(`
  SELECT id, full_name, status, next_follow_up, contact_date, created_at
  FROM leads WHERE id = 27
`);
console.log(JSON.stringify(r.recordset, null, 2));
await pool.close();
