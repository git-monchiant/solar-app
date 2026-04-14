import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT 
    GETDATE() as local_time,
    GETUTCDATE() as utc_time,
    DATEDIFF(HOUR, GETUTCDATE(), GETDATE()) as offset_hours
`);
console.log(JSON.stringify(r.recordset[0], null, 2));
await pool.close();
