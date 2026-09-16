// ลบตารางสำรอง om_*_v1 (ชุดก่อนย้ายโครงสร้าง) — ผู้ใช้สั่ง 10 ก.ย. 69
// ★ ดัมพ์ลงไฟล์นอกเซิร์ฟเวอร์ก่อนเสมอ แล้วค่อย DROP · ไม่มีโค้ดที่ไหนอ้างถึงตารางชุดนี้ (ตรวจแล้ว)
import sql from "mssql"; import fs from "fs"; import path from "path";
const WRITE = process.argv.includes("--yes");
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db=env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: "+db);
const OUT = `../docs/db-backup/20260910_v1_ก่อนลบ`;
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync("../docs/db-access-log/2026-09-10.jsonl", JSON.stringify({at:new Date().toISOString(),by:"chanetw",server:"172.41.1.73",database:db,login:env.DB_USER,
  purpose:(WRITE?"★ DROP ":"ตรวจ ")+"ตารางสำรอง om_*_v1 หลังดัมพ์ลงไฟล์"})+"\n");
const q=async s=>(await pool.request().query(s)).recordset;
const tabs=(await q(`SELECT t.name, ISNULL(SUM(p.rows),0) rows_ FROM sys.tables t
  LEFT JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
  WHERE t.name LIKE 'om[_]%[_]v1' GROUP BY t.name ORDER BY t.name`));
// มี FK ชี้เข้าตารางพวกนี้ไหม
const fks=await q(`SELECT OBJECT_NAME(f.parent_object_id) src, OBJECT_NAME(f.referenced_object_id) dst, f.name
  FROM sys.foreign_keys f WHERE OBJECT_NAME(f.referenced_object_id) LIKE 'om[_]%[_]v1'`);
console.log(`ตาราง _v1 ที่พบ ${tabs.length} ตาราง`);
tabs.forEach(t=>console.log(`  ${t.name.padEnd(28)}${String(t.rows_).padStart(7)} แถว`));
if (fks.length) { console.log("★ มี FK ชี้เข้า ต้องลบ FK ก่อน:"); fks.forEach(f=>console.log(`  ${f.src} → ${f.dst} (${f.name})`)); }
if (!WRITE) { console.log("\nตรวจอย่างเดียว — ใส่ --yes เพื่อดัมพ์แล้วลบจริง"); await pool.close(); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
for (const t of tabs) {
  const rows = await q(`SELECT * FROM [${t.name}]`);
  fs.writeFileSync(path.join(OUT, `${t.name}.jsonl`), rows.map(r=>JSON.stringify(r)).join("\n"));
  console.log(`  ดัมพ์ ${t.name} → ${rows.length} แถว`);
}
for (const f of fks) await q(`ALTER TABLE [${f.src}] DROP CONSTRAINT [${f.name}]`);
for (const t of tabs) { await q(`DROP TABLE [${t.name}]`); console.log(`  ลบ ${t.name}`); }
const left=await q(`SELECT COUNT(*) n FROM sys.tables WHERE name LIKE 'om[_]%' AND name NOT LIKE '%[_]bak[_]%'`);
console.log(`\nเหลือตาราง om_ (ไม่นับ _bak): ${left[0].n}`);
await pool.close();
