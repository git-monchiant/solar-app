import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT DISTINCT inverter_brand, inverter_kw FROM packages WHERE inverter_brand IS NOT NULL ORDER BY inverter_brand, inverter_kw`);
console.log(JSON.stringify(r.recordset, null, 2));
await pool.close();
