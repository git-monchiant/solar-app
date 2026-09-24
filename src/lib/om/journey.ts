// เลข journey ของงานบริการ O&M — สาย 2000
// (design: docs/plan/20260922-01-om-align-with-sales-concept.md · ผู้ใช้เคาะ 23 ก.ย. 69)
//
// ★ ไฟล์นี้เป็นค่าคงที่ล้วน ห้ามมี import ที่ลาก mssql เข้ามา — modules.tsx ใช้ไฟล์นี้
//   และ BottomNav เป็น "use client" (กับดักเดียวกับที่ booking.ts / booking-log.ts เคยเจอ)
//   คิวรีอยู่ที่ journey-sql.ts ฝั่ง server
//
// ★ ไม่มีคอลัมน์ journey_step ใน om_bookings โดยตั้งใจ — เลขแมปจาก status ตรงๆ
//   คำนวณด้วย CASE ในคิวรีถูกกว่าเก็บคอลัมน์ซ้ำที่ต้องคอย sync ทุกจุดที่เขียน status
//   (ฝั่งขายต้อง persist เพราะ journey derive จากหลายฟิลด์ — ของเราไม่ใช่กรณีนั้น)
//
// ★ เรียงเลขใหม่ทั้งสาย 24 ก.ย. 69 (แผน 20260924-02 เฟส 1 · ผู้ใช้เคาะ) — เว้น 2200/2300
//   ไว้ให้เสนอราคา/ชำระเงิน ที่จะมาในเฟส 2–4 จะได้เรียงตามลำดับขั้นจริง ไม่ต้องเลขกระโดด
//   ย้ายเลขได้โดยไม่ย้ายข้อมูล เพราะไม่มีที่ไหนเก็บเลขลงตาราง (ตาราง journey_steps มีแค่ป้าย)

/** ถึงรอบล้าง/โทรแล้วแต่ยังไม่ได้วันนัด — 2100 มาจากทั้งบ้านและใบงาน ดู journey-sql.ts */
export const OM_FOLLOW_STEP = 2100;

/** เลขขั้นหลัก 7 ขั้น + 2 ทางออก — ลำดับเดียวกับ FLOW ใน service-view.ts */
export const OM_STEP = {
  follow: OM_FOLLOW_STEP,
  quote: 2200,      // เสนอราคา (งานเสียเงิน — เฟส 2 ยังไม่มีใบงานอยู่ขั้นนี้)
  payment: 2300,    // ชำระเงิน (งานเสียเงิน — เฟส 4)
  appoint: 2400,    // นัดหมาย: 2410 รอยืนยันนัด · 2420 นัดแล้ว
  progress: 2500,   // เข้างาน
  checked: 2600,    // รอปิด
  closed: 2700,     // ปิดงาน
  cancelled: 2800,
  no_show: 2900,
} as const;

/** status ของใบงาน → เลข journey */
export const OM_STEP_BY_STATUS: Record<string, number> = {
  follow: OM_STEP.follow,
  pending: OM_STEP.appoint,
  confirmed: OM_STEP.appoint,
  progress: OM_STEP.progress,
  checked: OM_STEP.checked,
  closed: OM_STEP.closed,
  cancelled: OM_STEP.cancelled,
  no_show: OM_STEP.no_show,
};

/** ขั้นย่อยของนัดหมาย — ตามแบบฝั่งขาย (step 700 → sub 710/720) · status อื่นเป็น 0 */
export const OM_SUB_BY_STATUS: Record<string, number> = {
  pending: 2410,
  confirmed: 2420,
};

/** งานที่ยังค้างอยู่ = badge การ์ดโมดูล · ไม่รวมปิดงาน/ยกเลิก/ไม่อยู่บ้าน */
export const OM_ACTIVE_STEPS = [2100, 2200, 2300, 2400, 2500, 2600];
/** ขั้นที่ขึ้นปฏิทิน (มีวันนัดแล้ว) — ตรงกับ onCal ของ BOOKING_STATUS */
export const OM_SCHEDULED_STEPS = [2400, 2500, 2600];
/** ขั้นที่ช่างต้องกรอกใบตรวจรับงาน — ตรงกับ FIELD_STATUS ของหน้า /om/field
 *  (นัดแล้ว 2420 · เข้างาน · รอปิด — "รอยืนยันนัด" 2410 ยังไม่ถึงคิวช่าง จึงต้องแยกด้วย sub) */
export const OM_FIELD_STEPS = [2500, 2600];
export const OM_FIELD_SUBS = [2420];
