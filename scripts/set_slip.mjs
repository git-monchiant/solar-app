import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
await pool.request().query(`UPDATE leads SET line_slip_url = '/api/files/doc_1776062369569.jpg' WHERE id = 12`);
console.log('done');
await pool.close();
