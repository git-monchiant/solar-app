// เลข journey ของงานบริการ O&M — สาย 2000
// (design: docs/plan/20260922-01-om-align-with-sales-concept.md · ผู้ใช้เคาะ 23 ก.ย. 69)
//
// ★ ไฟล์นี้เป็นค่าคงที่ล้วน ห้ามมี import ที่ลาก mssql เข้ามา — modules.tsx ใช้ไฟล์นี้
//   และ BottomNav เป็น "use client" (กับดักเดียวกับที่ booking.ts / booking-log.ts เคยเจอ)
//   คิวรีอยู่ที่ journey-sql.ts ฝั่ง server
//
// ★ ไม่มีคอลัมน์ journey_step ใน om_bookings โดยตั้งใจ — เลขแมป 1:1 กับ status ตรงๆ
//   คำนวณด้วย CASE ในคิวรีถูกกว่าเก็บคอลัมน์ซ้ำที่ต้องคอย sync ทุกจุดที่เขียน status
//   (ฝั่งขายต้อง persist เพราะ journey derive จากหลายฟิลด์ — ของเราไม่ใช่กรณีนั้น)

/** ถึงรอบล้าง/โทรแล้วแต่ยังไม่ได้วันนัด — 2100 มาจากทั้งบ้านและใบงาน ดู journey-sql.ts */
export const OM_FOLLOW_STEP = 2100;

/** status ของใบงาน → เลข journey */
export const OM_STEP_BY_STATUS: Record<string, number> = {
  follow: OM_FOLLOW_STEP,
  pending: 2200,
  confirmed: 2300,
  progress: 2400,
  checked: 2500,
  closed: 2600,
  cancelled: 2800,
  no_show: 2900,
};

/** งานที่ยังค้างอยู่ = badge การ์ดโมดูล · ไม่รวมปิดงาน/ยกเลิก/ไม่อยู่บ้าน */
export const OM_ACTIVE_STEPS = [2100, 2200, 2300, 2400, 2500];
/** ขั้นที่ขึ้นปฏิทิน (มีวันนัดแล้ว) — ตรงกับ onCal ของ BOOKING_STATUS */
export const OM_SCHEDULED_STEPS = [2200, 2300, 2400, 2500];
/** ขั้นที่ช่างต้องกรอกใบตรวจรับงาน — ตรงกับ FIELD_STATUS ของหน้า /om/field */
export const OM_FIELD_STEPS = [2300, 2400, 2500];
