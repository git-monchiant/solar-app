import sql from "mssql"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db=env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: "+db);
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({at:new Date().toISOString(),by:"chanetw",server:"172.41.1.73",database:db,login:env.DB_USER,purpose:"ตรวจโครงสร้างสิทธิ์หลัง migration service_type (SELECT)"})+"\n");
const p=async(t,q)=>{console.log("\n== "+t);console.table((await pool.request().query(q)).recordset);};
await p("om_service_type", `SELECT * FROM om_service_type`);
await p("คอลัมน์ grants", `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='om_entitlement_grants' ORDER BY ORDINAL_POSITION`);
await p("คอลัมน์ redemptions", `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='om_redemptions' ORDER BY ORDINAL_POSITION`);
await p("grants ตามชนิด", `SELECT ISNULL(CAST(service_type_id AS varchar(10)),'NULL(ล้างแผง)') st, COUNT(*) rows_, SUM(qty) qty FROM om_entitlement_grants GROUP BY service_type_id`);
await p("redemptions", `SELECT status, COUNT(*) n FROM om_redemptions GROUP BY status`);
await pool.close();
