import sql from "mssql"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db=env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: "+db);
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
const r=await pool.request().query(`
  SELECT t.name, SUM(p.rows) rows_ FROM sys.tables t
  JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
  WHERE t.name LIKE 'om[_]%' AND t.name NOT LIKE '%[_]bak[_]%'
  GROUP BY t.name ORDER BY t.name`);
console.log(r.recordset.map(x=>`${x.name.padEnd(30)}${String(x.rows_).padStart(7)}`).join("\n"));
console.log("รวม", r.recordset.length, "ตาราง");
await pool.close();
