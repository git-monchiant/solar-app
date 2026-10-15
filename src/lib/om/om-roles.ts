// role ที่ทำงานในหน้างานบริการ O&M ได้ — ชุดเดียวกับ roles ของการ์ดโมดูล O&M (modules.tsx)
// ★ แผน 20261014-06: Account เปิดหน้างานจากคิว "รอยืนยันรับเงิน" แบบฝั่งขายเปิดหน้า lead
//   แต่ทำได้แค่ขั้น 03 ชำระเงิน (ยืนยันเงิน · แนบใบเสร็จ) — ไม่มี role ในชุดนี้ = หน้างานอ่านอย่างเดียว
//   ฝั่ง API ใช้ requireAnyRole(req, OM_WORK_ROLES) กับทางเขียนที่หน้านี้กดได้
// ★ ค่าคงที่ล้วน ใช้ได้ทั้ง client และ server
export const OM_WORK_ROLES = ["admin", "sales", "sales_sup", "solar", "solar_sup"] as const;
