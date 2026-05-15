import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT id, name, location FROM projects ORDER BY id`);
console.log('count:', r.recordset.length);
r.recordset.forEach(p => console.log(p.id, '-', p.name));
await pool.close();
