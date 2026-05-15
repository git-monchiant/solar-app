import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const wanted = ['email','note','last_activity_date','install_extra_cost','payment_confirmed','customer_type','source','line_id','zone'];
const r = await pool.request().query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name IN ('${wanted.join("','")}') ORDER BY name`);
console.log('Found:', r.recordset.map(x=>x.name));
console.log('Missing:', wanted.filter(w => !r.recordset.find(x=>x.name===w)));
await pool.close();
