import sql from "mssql"; import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
if(!/_v3$|_dev$/i.test(env.DB_NAME)) throw new Error("DB guard");
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
// วิวนี้ชี้ไปตาราง _v1 ที่เพิ่งลบ ⇒ พังแล้ว ลบตาม
await pool.request().query(`IF OBJECT_ID('dbo.om_entitlement_balance_v1','V') IS NOT NULL DROP VIEW dbo.om_entitlement_balance_v1`);
const r=await pool.request().query(`SELECT name FROM sys.views WHERE name LIKE 'om[_]%'`);
console.log("วิวที่เหลือ:", r.recordset.map(x=>x.name).join(", "));
await pool.close();
