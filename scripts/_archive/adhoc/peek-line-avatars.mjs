import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT TOP 10 display_name, picture_url, picture_local_path
  FROM line_users
  ORDER BY created_at DESC
`);
console.log(JSON.stringify(r.recordset, null, 2));
const c = await pool.request().query(`
  SELECT
    SUM(CASE WHEN picture_url IS NOT NULL AND picture_url <> '' THEN 1 ELSE 0 END) as has_remote,
    SUM(CASE WHEN picture_local_path IS NOT NULL THEN 1 ELSE 0 END) as has_local,
    COUNT(*) as total
  FROM line_users
`);
console.log('counts:', c.recordset[0]);
await pool.close();
