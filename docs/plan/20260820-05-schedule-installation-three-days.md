# นัดวันติดตั้งภายใน 3 วัน

วันที่: 2026-08-20
สถานะ: done

## เงื่อนไขใหม่

`SCHEDULE_INSTALLATION` (นัดวันติดตั้งและแจ้งเตรียมเอกสาร)

| หัวข้อ | เดิม (v2) | ใหม่ (v3) |
| --- | --- | --- |
| ครบกำหนด | 7 วัน | **3 วัน** |
| เตือนล่วงหน้า | 2 วัน | **1 วัน** |
| เริ่มนับจาก | ยืนยันมัดจำ | เหมือนเดิม |
| ปิดงานเมื่อ | นัดติดตั้ง หรือเปลี่ยนสถานะเป็น `install` | เหมือนเดิม |
| ใช้กับ | ทุกเกรด | เหมือนเดิม |

เวลาเตือน 1 วันคือค่าที่ policy รุ่น 3 วันใน migration 150 ใช้อยู่แล้ว

## สิ่งที่แก้

- `src/lib/sla-rules.ts` — `OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION` เป็น 4320/4320/1440
- `src/lib/sla-service.ts` — definition เป็น policy version 3
- `scripts/migrations/161_schedule_installation_three_days.sql` — เพิ่ม policy v3,
  ปิด v1-v2, คำนวณ `due_at`/`warning_at`/`status` ของ instance เดิมใหม่ รวมถึงแก้ผล
  ตัดสินทัน/เกินกำหนดของงานที่ปิดไปแล้ว
- `scripts/tests/sla-rules.mjs` — ทดสอบค่าใหม่

## การตรวจสอบ

- `npm run test:sla` ผ่าน · `npx tsc --noEmit` ผ่าน · `npx eslint` ผ่าน
- apply บน `solardb_dev` แล้ว รันซ้ำได้ผลเท่าเดิม (idempotent)
- ยังไม่ deploy Production

### ผลบน solardb_dev

- instance ทั้งหมด 38 ใบเป็น v3 · ช่วงเวลา 4320 นาทีเท่ากันทุกใบ
- ยังเปิดค้าง 5 ใบ เป็น breached ทั้งหมด (เดิม breached 2 + warning 3)
- ปิดแล้ว 33 ใบ ในจำนวนนี้นับว่าเกินกำหนด 15 ใบ
- **6 ใบที่เคยทันกำหนดภายใต้กติกา 7 วัน กลายเป็นเกินกำหนด** เพราะใช้เวลา 3-7 วัน
  ซึ่งเป็นผลตรงตามการบีบเวลาลง ไม่ใช่ข้อมูลผิด
