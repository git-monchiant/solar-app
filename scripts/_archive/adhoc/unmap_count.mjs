import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const l = await pool.request().query(`SELECT COUNT(*) AS n FROM leads WHERE line_id IS NOT NULL`);
const p = await pool.request().query(`SELECT COUNT(*) AS n FROM prospects WHERE line_id IS NOT NULL`);
console.log('leads w/ line_id:', l.recordset[0].n);
console.log('prospects w/ line_id:', p.recordset[0].n);
await pool.close();
