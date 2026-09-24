// ขอบเขต "lead ของงานขาย" — ใช้แทนชื่อตาราง leads ในคิวรีที่ดึงรายการ/นับตัวเลขของฝั่งขาย
//
// ★ ทำไมต้องมี (แผน docs/plan/20260924-02-om-quotation-approval-flow.md เฟส 2 · ผู้ใช้เคาะ 24 ก.ย. 69)
//   ใบเสนอราคางาน O&M ต้องผูก lead ของเจ้าของบ้าน — บ้าน O&M ส่วนใหญ่ไม่เคยผ่านระบบขาย
//   ระบบ O&M จึงสร้าง lead ให้ (leads.om_only = 1) และ lead พวกนี้ต้องไม่โผล่ใน pipeline /
//   Today / dashboard / BI ของทีมขาย
//
// ★ ทำไมเป็น derived table ไม่ใช่ VIEW: view ที่ SELECT * จะจำรายชื่อคอลัมน์ไว้ตอนสร้าง
//   พอฝั่งขายเพิ่มคอลัมน์ใน leads ทีหลัง คิวรีที่อ่านคอลัมน์ใหม่ผ่าน view จะพัง
//   derived table ถูกแปลใหม่ทุกครั้ง และ SQL Server ยุบรวมกับคิวรีหลัก index ยังใช้ได้ตามเดิม
//
// วิธีใช้: `FROM ${SALES_LEADS} l` แทน `FROM leads l` (ต้องมี alias เสมอ)
//   ถ้าคิวรีเดิมไม่มี alias ใช้ `FROM ${SALES_LEADS} leads` ชื่อคอลัมน์ที่อ้างถึงยังเหมือนเดิม
//   ห้ามใช้กับ INSERT / UPDATE / DELETE — ใช้กับการอ่านเท่านั้น
export const SALES_LEADS = "(SELECT * FROM leads WHERE om_only = 0)";

// ขอบเขต "เงินของงานขาย" — ใช้แทนชื่อตาราง payments ในคิวรีรายงาน/ตัวเลขของฝั่งขาย
//
// ★ แผน 20260924-02 เฟส 4 (ผู้ใช้เคาะ 24 ก.ย. 69): ค่าบริการ O&M ลงตาราง payments ตัวเดียวกัน
//   (Account มีบัญชีรับเงินชุดเดียว คิวรอยืนยันรับเงินคิวเดียว) แยกด้วย slip_field ขึ้นต้น "om_quote_"
//   (OM_SLIP_PREFIX ใน lib/om/om-quotation.ts — ไฟล์นี้ import ไม่ได้เพราะต้องไม่ลาก server-only)
//   รายรับ O&M แยกรายงานของตัวเอง ⇒ dashboard / รายงานรายรับของฝั่งขายต้องไม่นับเงินก้อนนี้
//   โดยเฉพาะบ้าน 5 หลังที่ใช้ lead ร่วมกับฝั่งขาย (SALES_LEADS กันไม่ได้ เพราะ lead เป็น om_only = 0)
// วิธีใช้เหมือน SALES_LEADS: `FROM ${SALES_PAYMENTS} p` · ไม่มี alias ใช้ `FROM ${SALES_PAYMENTS} payments`
export const SALES_PAYMENTS = "(SELECT * FROM payments WHERE slip_field NOT LIKE 'om[_]quote[_]%')";
