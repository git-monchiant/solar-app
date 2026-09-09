import sql from 'mssql'; import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-08.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:'dump om_houses/om_projects เพื่อแมปแถว PO จากคอลัมน์ DES (SELECT)'})+'\n');
const h = (await pool.request().query(`SELECT h.id, h.project_id, h.project_name, h.house_number, h.is_om, h.segment,
  i.id inst_id, i.install_date, i.inverter_kw FROM om_houses h LEFT JOIN om_installations i ON i.house_id=h.id WHERE h.house_number IS NOT NULL`)).recordset;
const p = (await pool.request().query(`SELECT project_id, name_th, name_en, project_type FROM om_projects`)).recordset;
fs.writeFileSync(process.argv[2], JSON.stringify({houses:h.map(r=>({...r, install_date: r.install_date? new Date(r.install_date).toISOString().slice(0,10):null})), projects:p}));
console.log('houses', h.length, 'projects', p.length); await pool.close();
