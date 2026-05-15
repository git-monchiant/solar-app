import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const cols = await pool.request().query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'projects'`);
console.log('columns:', cols.recordset.map(r => r.column_name));
const sample = await pool.request().query(`SELECT TOP 3 * FROM projects`);
console.log(JSON.stringify(sample.recordset, null, 2));
await pool.close();
