import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
console.log("วิว:", (await q(`SELECT name FROM sys.views WHERE name LIKE 'om[_]%'`)).map(x=>x.name).join(", "));
console.log("FK ภายในโมดูล:", (await q(`SELECT COUNT(*) n FROM sys.foreign_keys WHERE OBJECT_NAME(parent_object_id) LIKE 'om[_]%'`))[0].n);
console.log("FK จาก om_ ไปตารางของระบบขาย:", (await q(`SELECT OBJECT_NAME(parent_object_id) src, OBJECT_NAME(referenced_object_id) dst FROM sys.foreign_keys WHERE OBJECT_NAME(parent_object_id) LIKE 'om[_]%' AND OBJECT_NAME(referenced_object_id) NOT LIKE 'om[_]%'`)).map(x=>x.src+"→"+x.dst).join(", ") || "ไม่มี");
console.log("FK จากตารางระบบขายมาหา om_:", (await q(`SELECT OBJECT_NAME(parent_object_id) src FROM sys.foreign_keys WHERE OBJECT_NAME(parent_object_id) NOT LIKE 'om[_]%' AND OBJECT_NAME(referenced_object_id) LIKE 'om[_]%'`)).map(x=>x.src).join(", ") || "ไม่มี");
await pool.close();
