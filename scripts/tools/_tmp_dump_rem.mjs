import sql from 'mssql'; import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-08.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:'dump om_rem_units (unit_number=เลขแปลง) ทดสอบแมป PO ที่เหลือ (SELECT)'})+'\n');
const r = (await pool.request().query(`SELECT unit_id, project_id, project_name, unit_number, house_number, house_number_key, phase_name, model_name FROM om_rem_units`)).recordset;
fs.writeFileSync(process.argv[2], JSON.stringify(r)); console.log('rem_units', r.length); await pool.close();
