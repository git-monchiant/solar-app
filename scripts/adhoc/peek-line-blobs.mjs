import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN picture_blob IS NOT NULL THEN 1 ELSE 0 END) as has_blob,
    SUM(CAST(DATALENGTH(picture_blob) AS BIGINT)) as total_bytes
  FROM line_users
`);
console.table(r.recordset);
const top = await pool.request().query(`SELECT TOP 5 line_user_id, display_name, picture_mime, DATALENGTH(picture_blob) as bytes FROM line_users WHERE picture_blob IS NOT NULL ORDER BY bytes DESC`);
console.table(top.recordset);
await pool.close();
