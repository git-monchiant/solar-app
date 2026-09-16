# ยกเลิก SLA "ติดตามหลังติดตั้งและสอบถามความพึงพอใจ"

วันที่: 2026-08-20
สถานะ: done

## เหตุผล

ขั้น Warranty / After Sales มีสองนาฬิกาที่เริ่มพร้อมกันจากจุดเดียวกัน คือ
เวลาที่ติดตั้งเสร็จ

| Policy | กำหนด | ปิดเมื่อ |
| --- | --- | --- |
| `AFTER_SALES` | 3 วัน | ติดต่อลูกค้าได้ครั้งแรกหลังส่งมอบ |
| `CLOSE_LEAD` | 7 วัน | ปิด Lead |

สองรายการนี้วัดช่วงเดียวกันซ้อนกัน และการโทรติดตามครั้งเดียวมักปิดทั้งคู่
Timeline จึงรายงานเรื่องเดียวเป็นสองคำตัดสิน

กติกาที่เหลือคือกติกาเดียว: **ปิดเคสภายใน 7 วันหลังติดตั้งแล้วเสร็จ**
ซึ่ง `CLOSE_LEAD` ตั้งไว้ตรงตามนี้อยู่แล้ว (7 วันจาก `install_actual_date`
ตามแผน 14 เตือนก่อน 2 วัน) จึงไม่ต้องแก้ค่าใด

## สิ่งที่แก้

| ไฟล์ | การแก้ |
| --- | --- |
| `src/lib/sla-rules.ts` | ตัด `AFTER_SALES` ออกจาก `OPERATIONAL_SLA_MINUTES` |
| `src/lib/sla-service.ts` | ตัดออกจาก union `OperationalPolicyCode`, ตัด definition, ตัว subquery `after_sales` และคอลัมน์ที่ไม่มีใครใช้ต่อ |
| `src/app/(app)/leads/[id]/page.tsx` | ตัดออกจาก `SLA_STEP_BY_POLICY`, `slaCodes` ของขั้น Warranty และย้ายการจัดกลุ่มของขั้นไปอยู่ใต้ `CLOSE_LEAD` |
| `scripts/migrations/165_retire_after_sales_sla.sql` | ปิด policy และตั้งทุก instance เป็น `cancelled` พร้อมล้าง `breached_at` |

`lead_activities` ชนิด `after_sales` (บริการหลังการขาย) ยังบันทึกและแสดงตามเดิม
ถอนเฉพาะนาฬิกาที่จับเวลาเรื่องนี้

## ผลบน solardb_dev

- policy `AFTER_SALES` → `is_active = 0`
- instance ทั้ง 6 ใบ → `cancelled` ไม่เหลือ `breached_at`
- `CLOSE_LEAD` ยังทำงานปกติ (5 ใบ ซึ่งทั้งหมดเกินกำหนดอยู่แล้วก่อนการแก้นี้)
- รันซ้ำได้ผลเดิม

## การตรวจสอบ

- `npx tsc --noEmit` ผ่าน
- `npx eslint` ไฟล์ที่แก้ ไม่มี error (เหลือ warning เดิม 3 รายการ)
- `node scripts/tests/sla-rules.mjs` ผ่าน
- `npm run build` ผ่าน
- ยังไม่ deploy Production
