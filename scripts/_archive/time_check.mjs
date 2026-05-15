import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true, useUTC: false } });
const r = await pool.request().query(`SELECT GETDATE() as db_now`);
console.log('DB:', r.recordset[0].db_now);
console.log('JS:', new Date().toString());
await pool.close();
