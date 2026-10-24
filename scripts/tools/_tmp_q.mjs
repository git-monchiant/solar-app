import sql from 'mssql'; import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_HOST||env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASS||env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-08.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:process.argv[2]||'(SELECT)'})+'\n');
const q = async (s) => (await pool.request().query(s)).recordset;
const out = {};
for (const [k,s] of Object.entries(JSON.parse(fs.readFileSync(process.argv[3],'utf8')))) { try { out[k] = await q(s); } catch(e){ out[k] = 'ERR '+e.message; } }
for (const [k,v] of Object.entries(out)) console.log("## "+k+"\n"+(Array.isArray(v)&&v.length&&Object.keys(v[0]).length<=2? v.map(r=>Object.values(r).join(":")).join(", ") : JSON.stringify(v))); await pool.close();
