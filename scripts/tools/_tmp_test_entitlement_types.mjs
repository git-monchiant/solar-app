// ทดสอบปลายทางถึงปลายทาง: ขายแพ็ค "ตรวจเช็กประจำปี" เป็นครั้ง แล้วปิดงานตรวจ
// ต้องได้ผล: ตัดสิทธิ์ของ "ตรวจเช็ก" ไม่ใช่ของ "ล้างแผง" · ยอดล้างแผงต้องไม่ขยับ
// ทำแล้วล้างของทดสอบทิ้งทั้งหมด (ทั้งแถวและค่า consumes_quota ที่ยืมเปิดชั่วคราว)
import sql from "mssql"; import fs from "fs";
const BASE = "http://localhost:3010";
const H = { "Content-Type": "application/json", "x-user-id": "1" };
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^DB_/.test(l))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db = env.DB_NAME; if(!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: "+db);
const pool = await sql.connect({server:env.DB_SERVER,port:Number(env.DB_PORT||1433),user:env.DB_USER,password:env.DB_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({at:new Date().toISOString(),by:"chanetw",server:"172.41.1.73",database:db,login:env.DB_USER,
  purpose:"★ WRITE ชั่วคราว ทดสอบสิทธิ์แยกตามประเภทงาน แล้วลบของทดสอบทิ้ง"})+"\n");
const q = async (s, ...a) => { const r = pool.request(); a.forEach((v,i)=>r.input("p"+i, v)); return (await r.query(s)).recordset; };
const api = async (m, p, body) => { const r = await fetch(BASE+p, {method:m, headers:H, body: body?JSON.stringify(body):undefined});
  const j = await r.json().catch(()=>({})); if(!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j)}`); return j; };

const types = await q(`SELECT id, code, label_th, CAST(consumes_quota AS int) cq, cycle_months FROM om_service_type`);
const INSPECT = types.find(t=>t.code==="inspect").id, CLEAN = types.find(t=>t.code==="cleaning").id;
const house = (await q(`SELECT TOP 1 h.id, h.house_number FROM om_houses h
  JOIN om_installations i ON i.house_id = h.id
  WHERE h.is_om = 1 AND NOT EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id)
  ORDER BY h.id`))[0];
const bal = async () => (await q(`SELECT service_type_code c, SUM(balance) b, SUM(total_granted) g, SUM(total_used) u
  FROM om_entitlement_balance WHERE house_id = ${house.id} GROUP BY service_type_code`))
  .map(r=>`${r.c} เหลือ ${r.b} (ให้ ${r.g} ใช้ ${r.u})`).join(" · ") || "ไม่มีสิทธิ์";
console.log(`บ้านทดสอบ #${house.id} ${house.house_number}`);
console.log(`  ก่อนเริ่ม : ${await bal()}`);

let grantId = null, bookingId = null;
try {
  // 1) ขายแพ็คตรวจเช็ก 2 ครั้ง ผ่าน API จริง
  grantId = (await api("POST", `/api/om/houses/${house.id}/entitlements`,
    { kind:"grant", qty:2, source:"purchase", reason:"ทดสอบแพ็คตรวจเช็ก", service_type_id: INSPECT })).id;
  console.log(`  ขายแพ็ค   : ${await bal()}`);

  // 2) แอดมินเปิดให้งานตรวจเช็ก "กินสิทธิ์" (ขั้นตอนจริงตอนเริ่มขายแพ็ค)
  await q(`UPDATE om_service_type SET consumes_quota = 1 WHERE id = ${INSPECT}`);

  // 3) สร้างงานตรวจเช็ก แล้วเดินสถานะจนปิดงาน
  bookingId = (await api("POST", "/api/om/bookings",
    { house_id: house.id, service_type_id: INSPECT, scheduled_at: "2026-09-10T09:00", note:"ทดสอบ" })).id;
  for (const st of ["confirmed","progress","checked","closed"])
    await api("PATCH", `/api/om/bookings/${bookingId}`, { status: st });
  console.log(`  ปิดงานตรวจ: ${await bal()}`);

  const rd = await q(`SELECT r.id, r.service_type_id, st.label_th, r.note FROM om_redemptions r
    JOIN om_service_type st ON st.id = r.service_type_id WHERE r.booking_id = ${bookingId}`);
  console.log(`  ใบตัดสิทธิ์: ${rd.map(x=>`#${x.id} ${x.label_th} · ${x.note}`).join(", ") || "★ ไม่เกิดใบตัดสิทธิ์"}`);

  // 4) ย้อนสถานะออกจากปิดงาน → ต้องคืนสิทธิ์
  await api("PATCH", `/api/om/bookings/${bookingId}`, { status: "progress" });
  console.log(`  ย้อนสถานะ : ${await bal()}`);
} finally {
  // ล้างของทดสอบให้หมด
  if (bookingId) { await q(`DELETE FROM om_redemptions WHERE booking_id = ${bookingId}`);
                   await q(`DELETE FROM om_booking_history WHERE booking_id = ${bookingId}`);
                   await q(`DELETE FROM om_bookings WHERE id = ${bookingId}`); }
  if (grantId)   { await q(`DELETE FROM om_entitlement_grants WHERE id = ${grantId}`);
                   await q(`DELETE FROM om_entitlement_history WHERE ref_id = ${grantId} AND kind = 'grant' AND house_id = ${house.id}`); }
  await q(`UPDATE om_service_type SET consumes_quota = 0 WHERE id = ${INSPECT}`);
  console.log(`  ล้างของทดสอบแล้ว: ${await bal()}`);
  await pool.close();
}
