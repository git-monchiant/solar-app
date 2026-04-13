import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT DISTINCT battery_kwh, battery_brand FROM packages WHERE has_battery = 1 ORDER BY battery_kwh`);
console.log(JSON.stringify(r.recordset, null, 2));
await pool.close();
