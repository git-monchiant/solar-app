# ยกเลิก SLA "ตรวจสอบข้อมูลและมอบหมายผู้รับผิดชอบ"

วันที่: 2026-08-20
สถานะ: done

## ปัญหา

แถว `ASSIGN_OWNER` (SLA 15 นาที / สูงสุด 1 ชม.) เป็นแถวแรกของขั้น Pre-Survey
ใน Timeline แต่แทบไม่เคยวัดอะไรได้จริง เพราะการมอบหมายผู้รับผิดชอบเกิดพร้อม
การสร้าง Lead — `owner_assigned_at` จึงเท่ากับ `created_at` และแถวรายงาน
"ใช้จริง 0 นาที" เสมอ

ที่แย่กว่าคือ Lead ที่ import เข้ามาโดยยังไม่มีเจ้าของจะค้างสถานะ `breached`
ถาวร ไปโผล่ใน Dashboard SLA และดันตัวเลข "เกิน" ที่หัวหน้าจอ Lead ทั้งที่
ไม่มีงานให้ใครทำ

## ขอบเขตที่เลือก

เลิกใช้ทั้งระบบ ไม่ใช่แค่ซ่อนใน Timeline — ถ้าซ่อนอย่างเดียว ตัวเลข
"ผ่าน / เกิน" กับ Dashboard SLA จะยังนับแถวที่มองไม่เห็น และล้างข้อมูลเดิม
ย้อนหลังทุกใบเพื่อไม่ให้ Lead เก่ายังติดสีแดงจาก policy ที่ยกเลิกไปแล้ว

`leads.owner_assigned_at` ยังอยู่ครบ — การมอบหมายยังถูกบันทึกตามเดิม
ถอนเฉพาะ "นาฬิกา SLA" ที่จับเวลาเรื่องนี้

## สิ่งที่แก้

| ไฟล์ | การแก้ |
| --- | --- |
| `src/lib/sla-rules.ts` | ตัด `ASSIGN_OWNER` ออกจาก `OPERATIONAL_SLA_MINUTES` |
| `src/lib/sla-service.ts` | ตัดออกจาก union `OperationalPolicyCode` และตัด definition ที่สร้าง instance พร้อมตัวแปร `createdAt` ที่ไม่มีใครใช้ต่อ |
| `src/app/(app)/leads/[id]/page.tsx` | ตัดออกจาก `SLA_STEP_BY_POLICY`, `slaCodes` ของขั้น Pre-Survey และกติกา tie-break ที่เคยจัดให้อยู่หลัง "ลงทะเบียน Lead" |
| `scripts/migrations/163_retire_assign_owner_sla.sql` | ปิด policy (`is_active=0`) และตั้งทุก instance เป็น `cancelled` พร้อมล้าง `breached_at` และบันทึก `lead_sla_events` |

ลำดับ tie-break เหลือ ลงทะเบียน → ติดต่อครั้งแรก → milestone อื่น → SLA ขั้นถัดไป

เก็บ `completed_at` ไว้เพราะเป็นข้อเท็จจริงว่ามอบหมายเมื่อไหร่ แต่ล้าง
`breached_at` เพราะเป็นคำตัดสินของ policy ที่ถอนไปแล้ว

Timeline, Dashboard SLA และ chip สรุปกรอง `cancelled` ออกอยู่แล้ว จึงหายพร้อมกัน
ทั้งสามที่โดยไม่ต้องแก้ query เพิ่ม และ `refreshOpenSlaStates` แตะเฉพาะ
`active/warning/critical/breached` แถวที่ถูกยกเลิกจึงไม่ฟื้นกลับมา

## การตรวจสอบ

- `npx tsc --noEmit` ผ่าน
- `npx eslint` ไฟล์ที่แก้ ไม่มี error (เหลือ warning เดิม 3 รายการใน `page.tsx`)
- `node scripts/tests/sla-rules.mjs` ผ่าน
- `npm run build` ผ่าน
- migration 163 apply `solardb_dev`: instance 268 ใบเป็น `cancelled` ทั้งหมด,
  ไม่มีใบใดเหลือ `breached_at`, event 268 รายการ; รันซ้ำ 3 รอบตัวเลขไม่ขยับ
- ยังไม่ deploy Production
