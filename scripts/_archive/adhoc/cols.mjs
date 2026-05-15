import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('leads') ORDER BY name
`);
console.log(r.recordset.map(x => x.name).join('\n'));
await pool.close();
