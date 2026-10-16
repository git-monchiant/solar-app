import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const has = k => env[k] ? `ตั้งแล้ว (${String(env[k]).length} ตัวอักษร)` : "★ ไม่มี";
for (const k of ["SMSMKT_API_URL","SMSMKT_API_KEY","SMSMKT_SECRET_KEY","SMSMKT_SENDER","SMSMKT_PROJECT_ID","OM_OTP_DEV"])
  console.log(`  ${k.padEnd(20)} ${k==="SMSMKT_API_URL"||k==="SMSMKT_SENDER"||k==="OM_OTP_DEV" ? (env[k]??"★ ไม่มี") : has(k)}`);
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const r=await pool.request().query(`SELECT [key], value FROM app_settings WHERE [key] LIKE '%sms%'`);
console.log("\n  สวิตช์ SMS ในระบบขาย:", JSON.stringify(r.recordset));
await pool.close();
