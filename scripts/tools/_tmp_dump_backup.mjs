// สำเนาข้อมูลออกนอกเซิร์ฟเวอร์ — เขียนตาราง om_* เป็นไฟล์ JSON บรรทัดละแถว (JSONL)
// คู่กับ backup ในฐาน (om_*_bak_<ts>) เผื่อฐานมีปัญหาทั้งเครื่อง
import sql from 'mssql'; import fs from 'fs';
const OUT = process.argv[2];
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>/^DB_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error('DB guard: '+db);
const pool = await sql.connect({server:env.DB_SERVER, port:Number(env.DB_PORT||1433), user:env.DB_USER, password:env.DB_PASSWORD, database:db, options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync('../docs/db-access-log/2026-09-09.jsonl', JSON.stringify({at:new Date().toISOString(),by:'chanetw',server:'172.41.1.73',database:db,login:env.DB_USER,purpose:'dump ตาราง om_* เป็นไฟล์ JSONL สำรองนอกเซิร์ฟเวอร์ (SELECT)'})+'\n');
const tables = (await pool.request().query(`
  SELECT t.name FROM sys.tables t WHERE t.name LIKE 'om[_]%'
    AND t.name NOT LIKE '%[_]bak[_]%' AND t.name NOT LIKE '%[_]v1' ORDER BY t.name`)).recordset.map(r=>r.name);
fs.mkdirSync(OUT, {recursive:true});
let total = 0; const manifest = [];
for (const t of tables) {
  const rs = (await pool.request().query(`SELECT * FROM [${t}]`)).recordset;
  const p = `${OUT}/${t}.jsonl`;
  fs.writeFileSync(p, rs.map(r=>JSON.stringify(r)).join('\n') + (rs.length?'\n':''));
  manifest.push({table:t, rows:rs.length, bytes:fs.statSync(p).size});
  total += rs.length;
  console.log(`  ${t.padEnd(28)} ${String(rs.length).padStart(7)} แถว`);
}
fs.writeFileSync(`${OUT}/_manifest.json`, JSON.stringify({at:new Date().toISOString(), database:db, tables:manifest, total_rows:total}, null, 1));
console.log(`\nรวม ${tables.length} ตาราง · ${total.toLocaleString()} แถว → ${OUT}`);
await pool.close();
