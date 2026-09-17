import sql from "mssql"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db=env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: "+db);
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
console.table(await q(`SELECT code, label_th, CAST(consumes_quota AS int) กินสิทธิ์, cycle_months รอบเดือน FROM om_service_type ORDER BY sort_order`));
console.table(await q(`SELECT 'grants' t, COUNT(*) แถว, SUM(CASE WHEN service_type_id IS NULL THEN 1 ELSE 0 END) ยังไม่ระบุชนิด FROM om_entitlement_grants
  UNION ALL SELECT 'redemptions', COUNT(*), SUM(CASE WHEN service_type_id IS NULL THEN 1 ELSE 0 END) FROM om_redemptions`));
console.table(await q(`SELECT service_type_code ชนิด, COUNT(*) แถววิว, SUM(total_granted) ให้, SUM(total_used) ใช้, SUM(balance) คงเหลือ
  FROM om_entitlement_balance GROUP BY service_type_code`));
console.table(await q(`SELECT COUNT(*) bookings_เหลือ FROM om_bookings`));
console.table(await q(`SELECT COUNT(*) สิทธิ์ของบ้าน13423 FROM om_entitlement_grants g JOIN om_installations i ON i.id=g.installation_id WHERE i.house_id=13423`));
await pool.close();
