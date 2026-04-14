import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT id, lead_id, slip_url, status, confirmed FROM bookings WHERE lead_id = 12`);
console.log(JSON.stringify(r.recordset, null, 2));
await pool.close();
