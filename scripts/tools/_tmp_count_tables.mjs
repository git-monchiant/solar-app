import sql from "mssql"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db=env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: "+db);
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
const all=await q(`SELECT t.name, ISNULL(SUM(p.rows),0) rows_ FROM sys.tables t
  LEFT JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
  WHERE t.name LIKE 'om[_]%' GROUP BY t.name`);
const bak = all.filter(x=>/_bak_\d/.test(x.name));
const v1  = all.filter(x=>/_v1$/.test(x.name));
const live= all.filter(x=>!/_bak_\d/.test(x.name) && !/_v1$/.test(x.name));
const views=await q(`SELECT name FROM sys.views WHERE name LIKE 'om[_]%'`);
console.log(`ใช้งานจริง   ${String(live.length).padStart(3)} ตาราง · ${live.reduce((s,x)=>s+Number(x.rows_),0).toLocaleString()} แถว`);
console.log(`สำรอง _v1    ${String(v1.length).padStart(3)} ตาราง · ${v1.reduce((s,x)=>s+Number(x.rows_),0).toLocaleString()} แถว`);
console.log(`สำรอง _bak   ${String(bak.length).padStart(3)} ตาราง · ${bak.reduce((s,x)=>s+Number(x.rows_),0).toLocaleString()} แถว`);
console.log(`รวมทั้งหมด   ${String(all.length).padStart(3)} ตาราง · วิว ${views.length}`);
console.log("\nตารางที่ยังว่าง (0 แถว):");
console.log(live.filter(x=>Number(x.rows_)===0).map(x=>"  "+x.name).sort().join("\n") || "  ไม่มี");
await pool.close();
