import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT GETDATE() as server_now, SYSDATETIMEOFFSET() as server_offset`);
console.log('SQL Server:', r.recordset[0]);
console.log('Node.js:', new Date().toString());
await pool.close();
