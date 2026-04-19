import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT TOP 5 * FROM lead_activities WHERE lead_id = 12 ORDER BY created_at DESC`);
console.log(JSON.stringify(r.recordset.map(a => ({ type: a.activity_type, title: a.title, created: a.created_at })), null, 2));
await pool.close();
