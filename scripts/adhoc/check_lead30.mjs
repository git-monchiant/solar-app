import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT * FROM leads WHERE id = 30`);
const l = r.recordset[0];
if (!l) { console.log("no lead 30"); await pool.close(); process.exit(0); }
// Filter to survey_* fields + status + a few core
const keys = Object.keys(l).filter(k => k.startsWith('survey_') || ['id','status','full_name','pre_electrical_phase','pre_wants_battery'].includes(k));
const out = {};
for (const k of keys) out[k] = l[k];
console.log(JSON.stringify(out, null, 2));
await pool.close();
