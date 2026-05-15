import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT TOP 10 id, line_user_id, display_name, created_at, GETDATE() AS server_now
  FROM line_users ORDER BY created_at DESC
`);
console.log(JSON.stringify(r.recordset, null, 2));
await pool.close();
