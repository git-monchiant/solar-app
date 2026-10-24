import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
console.log("คอลัมน์:", (await q(`SELECT COLUMN_NAME n, DATA_TYPE d FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='om_settings' ORDER BY ORDINAL_POSITION`)).map(x=>x.n+":"+x.d).join(" · "));
console.log("ตัวอย่าง:", JSON.stringify((await q(`SELECT TOP 4 * FROM om_settings`))));
await pool.close();
