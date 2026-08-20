# Qualification SLA: 1 วันนับจากติดต่อ Lead ได้

วันที่: 2026-08-20
สถานะ: done

## เงื่อนไขใหม่

`ELECTRICITY_ASSESSMENT` (ประเมินและกำหนด Grade Lead) ใช้กติกาเดียวกันทุก Lead Source:

- **ครบกำหนดภายใน 24 ชั่วโมง** นับจากเวลาที่ **ติดต่อลูกค้าได้ครั้งแรก**
- เตือนล่วงหน้า 4 ชั่วโมงก่อนครบกำหนด (`critical` เมื่อเหลือ ≤ 30 นาที ตามกลไกกลาง)
- ปิดงานเมื่อบันทึก Grade ให้ Lead (เหมือนเดิม)

ยกเลิกกติกาแยกตาม Source ของ policy version 2 (call/walk_in 30 นาที · referral/event/booth
120 นาที · digital 60 นาที) ทั้งหมด

## จุดเริ่มนับ (ไม่เปลี่ยน)

`started_at` ยังคงเป็น activity แรกที่ `contact_result='connected'` (หรือ title ที่ไม่ใช่
"ติดต่อไม่ได้" / "ข้อมูลติดต่อไม่ถูกต้อง" สำหรับข้อมูลเก่าที่ยังไม่มี `contact_result`)
Lead ที่ถูก backfill โดย migration 156 ยังใช้ grade epoch สังเคราะห์เป็น anchor เหมือนเดิม
เพื่อไม่ให้ข้อมูลเก่ากลายเป็นเกินกำหนดย้อนหลัง

## สิ่งที่แก้

- `src/lib/sla-rules.ts` — ลบ `qualificationSlaMinutes()` ทิ้ง เหลือแหล่งเดียวคือ
  `OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT = { target: 1440, due: 1440, warning: 240 }`
- `src/lib/sla-service.ts` — definition ของ `ELECTRICITY_ASSESSMENT` เป็น policy version 3
  และอ่านเวลาจากค่าคงที่กลางแทนกติกาตาม source
- `scripts/migrations/158_qualification_one_day_sla.sql` — เพิ่ม policy version 3,
  ปิด version 1-2, และคำนวณ `due_at`/`warning_at`/`status` ของ instance เดิมใหม่ทั้งหมด
  รวมถึงแก้ผลตัดสิน "ทันกำหนด/เกินกำหนด" ของงานที่ปิดไปแล้ว
- `scripts/tests/sla-rules.mjs` — ทดสอบค่าใหม่แทน assertion ของกติกาตาม source

## ผลกระทบ

- Lead จาก call/walk_in ที่เคยมีเวลาเพียง 30 นาที ได้เวลาเต็ม 24 ชั่วโมง — instance ที่
  `breached` อยู่จำนวนหนึ่งจะกลับเป็น `active`/`completed ทันกำหนด` หลังรัน migration
- SLA อื่นทั้งหมด (First Contact, Retry D3/D5/D7/D30, Grade Playbook A-F และ operational
  ทุกขั้น) ไม่เปลี่ยน

## การตรวจสอบ

- `npm run test:sla` ผ่าน
- `npx tsc --noEmit` ผ่าน
- `npx eslint src/lib/sla-rules.ts src/lib/sla-service.ts` ผ่าน
- ยังไม่ apply migration 158 ลง solardb_dev / Production
