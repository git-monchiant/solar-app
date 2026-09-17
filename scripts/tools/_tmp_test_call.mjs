// ทดสอบบันทึกการโทร 3 แบบ แล้วล้างทิ้ง
import sql from "mssql"; import fs from "fs";
const B="http://localhost:3010", H={"Content-Type":"application/json","x-user-id":"1"};
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
if(!/_v3$|_dev$/i.test(env.DB_NAME)) throw new Error("DB guard");
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
const api=async(m,p,b)=>{const r=await fetch(B+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j)}`); return j;};

const list = await api("GET","/api/om/follow?tab=follow&size=1");
const h = list.items[0];
console.log(`บ้านทดสอบ #${h.house_id} ${h.house_number} · ${h.customer_name}`);

const r1 = await api("POST","/api/om/follow",{house_id:h.house_id,outcome:"no_answer",note:"ทดสอบ ไม่รับสาย"});
console.log("  ไม่รับสาย   →", JSON.stringify(r1));
const r2 = await api("POST","/api/om/follow",{house_id:h.house_id,outcome:"postponed",note:"ทดสอบ ขอเลื่อน"});
console.log("  ขอเลื่อน    →", JSON.stringify(r2));
const r3 = await api("POST","/api/om/follow",{house_id:h.house_id,outcome:"agreed",scheduled_at:"2026-09-20T09:00",note:"ทดสอบ ตกลงนัด"});
console.log("  ตกลงนัด     →", JSON.stringify(r3));

console.log("  ประวัติ:", JSON.stringify(await q(`SELECT [action], JSON_VALUE(to_json,'$.outcome') outcome,
  booking_id, house_id, CONVERT(char(10),next_action_date,23) next FROM om_booking_history WHERE house_id=${h.house_id} ORDER BY id`)));
console.log("  ใบงาน:", JSON.stringify(await q(`SELECT id,status,CONVERT(varchar(25),scheduled_at,126) at,source FROM om_bookings WHERE house_id=${h.house_id}`)));
const after = await api("GET","/api/om/follow?tab=follow&size=1");
console.log("  หลังนัดแล้ว counts:", JSON.stringify(after.counts));

// ล้างของทดสอบ
await q(`DELETE FROM om_booking_history WHERE house_id=${h.house_id}`);
await q(`DELETE FROM om_bookings WHERE house_id=${h.house_id}`);
console.log("  ล้างของทดสอบแล้ว · counts:", JSON.stringify((await api("GET","/api/om/follow?tab=follow&size=1")).counts));
await pool.close();
