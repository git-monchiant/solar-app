// ทดสอบครบเส้น: โทร → ตกลงนัด → กรอกใบตรวจรับงาน → ปิดงาน → ตัดสิทธิ์ แล้วล้างทิ้ง
import sql from "mssql"; import fs from "fs";
const B="http://localhost:3000", H={"Content-Type":"application/json","x-user-id":"1"};
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
 .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
if(!/_v3$|_dev$/i.test(env.DB_NAME)) throw new Error("DB guard");
const pool=await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,options:{encrypt:false,trustServerCertificate:true}});
const q=async s=>(await pool.request().query(s)).recordset;
const api=async(m,p,b)=>{const r=await fetch(B+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j).slice(0,200)}`); return j;};

const h = (await api("GET","/api/om/follow?tab=follow&size=1")).items[0];
const bal0 = (await q(`SELECT SUM(balance) b FROM om_entitlement_balance WHERE house_id=${h.house_id} AND service_type_code='cleaning'`))[0].b;
console.log(`บ้าน #${h.house_id} ${h.house_number} · ${h.customer_name} · สิทธิ์ก่อน ${bal0}`);

const call = await api("POST","/api/om/follow",{house_id:h.house_id,outcome:"agreed",scheduled_at:"2026-09-22T09:00",note:"ทดสอบครบเส้น"});
const jid = call.booking_id;
console.log(`  ตกลงนัด → ใบงาน #${jid}`);

const rep0 = await api("GET",`/api/om/jobs/${jid}/report`);
console.log(`  เปิดใบงาน: ${rep0.job.house_number} · ${rep0.job.service_type} · รายงานเดิม ${rep0.report ? "มี" : "ยังไม่มี"}`);

const checks = {panel:{pass:true},inverter:{pass:true},control_box:{pass:true},dc_breaker:{pass:true},
  ac_breaker:{pass:true},wireway:{pass:false,fix:"แคลมป์หลวม ขันแล้ว"},wiring:{pass:true}};
await api("PUT",`/api/om/jobs/${jid}/report`,{checks,
  measures:{v_dc:279,i_dc:2.53,v_ac:233,i_ac:2.86,pin:0.671,pout:0.657,ppk:3.46},
  note:"ล้างแผง เครื่องทำงานปกติ"});
console.log("  บันทึกร่างแล้ว");

const saved = (await api("GET",`/api/om/jobs/${jid}/report`)).report;
console.log(`  อ่านกลับ: ไม่ผ่าน ${saved.fail_count} ข้อ · เลขใบ ${saved.job_no} · Ppk ${saved.measures.ppk}`);

await api("PUT",`/api/om/jobs/${jid}/report`,{checks,result:"pass",close_method:"onsite_sign",
  cust_sign:"data:image/png;base64,TEST",lat:13.8912,lng:100.6741,gps_accuracy:8});
for (const st of ["confirmed","progress","checked","closed"]) await api("PATCH",`/api/om/bookings/${jid}`,{status:st});
const bal1 = (await q(`SELECT SUM(balance) b FROM om_entitlement_balance WHERE house_id=${h.house_id} AND service_type_code='cleaning'`))[0].b;
const rd = await q(`SELECT service_type_id, note FROM om_redemptions WHERE booking_id=${jid}`);
console.log(`  ปิดงานแล้ว · สิทธิ์เหลือ ${bal1} (ลดลง ${bal0-bal1}) · ใบตัดสิทธิ์ ${rd.length} ใบ`);
console.log(`  หลักฐาน:`, JSON.stringify((await q(`SELECT result,fail_count,close_method,lat,lng,gps_accuracy,LEFT(device,28) device FROM om_job_report WHERE booking_id=${jid}`))[0]));

// ล้างของทดสอบ
await q(`DELETE FROM om_redemptions WHERE booking_id=${jid}`);
await q(`DELETE FROM om_job_report WHERE booking_id=${jid}`);
await q(`DELETE FROM om_booking_history WHERE booking_id=${jid} OR house_id=${h.house_id}`);
await q(`DELETE FROM om_bookings WHERE id=${jid}`);
const bal2 = (await q(`SELECT SUM(balance) b FROM om_entitlement_balance WHERE house_id=${h.house_id} AND service_type_code='cleaning'`))[0].b;
console.log(`  ล้างของทดสอบแล้ว · สิทธิ์กลับเป็น ${bal2}`);
await pool.close();
