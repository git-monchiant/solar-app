import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const before = await pool.request().query(`SELECT COUNT(*) AS n FROM prospects`);
console.log('prospects before:', before.recordset[0].n);
const r = await pool.request().query(`DELETE FROM prospects`);
console.log('deleted:', r.rowsAffected[0]);
const after = await pool.request().query(`SELECT COUNT(*) AS n FROM prospects`);
console.log('prospects after:', after.recordset[0].n);
await pool.close();
