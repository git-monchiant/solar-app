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
