import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT 
    GETDATE() as getdate,
    GETUTCDATE() as utc,
    SYSDATETIMEOFFSET() as with_offset,
    CURRENT_TIMEZONE() as timezone
`);
console.log(JSON.stringify(r.recordset[0], null, 2));
await pool.close();
