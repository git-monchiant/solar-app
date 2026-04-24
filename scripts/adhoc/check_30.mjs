import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT * FROM leads WHERE id = 30`);
const l = r.recordset[0];
const surveyFields = Object.keys(l).filter(k => k.startsWith('survey_')).reduce((a,k) => { a[k] = l[k]; return a; }, {});
console.log('status:', l.status);
console.log('survey fields:');
console.log(JSON.stringify(surveyFields, null, 2));
await pool.close();
