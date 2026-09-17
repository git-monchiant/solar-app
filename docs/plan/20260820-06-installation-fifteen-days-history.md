# SLA ติดตั้ง แสดง 15 วันให้ตรงกันทุกใบ

วันที่: 2026-08-20
สถานะ: done

## ปัญหา

Timeline ของ Lead บางรายแสดง `SLA 7 วัน / สูงสุด 14 วัน` ทั้งที่กติกาปัจจุบันของ
`INSTALLATION` คือ 15 วัน

สาเหตุ: กติกา 15 วันอยู่ใน `OPERATIONAL_SLA_MINUTES.INSTALLATION` และ policy version 2
มาตั้งแต่ migration 156 แล้ว แต่ instance ที่ **ปิดงานไปตั้งแต่ยังใช้ version 1**
ถูกแช่แข็งไว้เป็นประวัติ (`reconcileOperationalInstance` ไม่คำนวณแถวที่ปิดแล้วซ้ำ)
จึงยังถือค่า target 7 วัน / hard limit 14 วันของ migration 150 อยู่

## สิ่งที่แก้

ไม่ต้องแก้โค้ด — ค่าคงที่และ definition เป็น 15 วันอยู่แล้ว แก้เฉพาะข้อมูล

- `scripts/migrations/162_installation_fifteen_days_history.sql`
  - ปิด policy `INSTALLATION` version 1
  - คำนวณ `target_at` / `due_at` / `warning_at` ของทุก instance ที่ยังมีความหมายใหม่
    เป็น 15 วัน เตือนก่อน 3 วัน รวมถึงแก้ผลตัดสินทัน/เกินกำหนดของงานที่ปิดไปแล้ว

เส้นตายขยับไปทางยาวขึ้นเท่านั้น ผลตัดสินจึงเปลี่ยนได้ทางเดียวคือจาก "เกิน" เป็น "ทัน"

## ผลบน solardb_dev

| | ก่อน | หลัง |
| --- | --- | --- |
| v1 completed (target 168 ชม. / due 336 ชม.) | 6 | 0 |
| v2 (target = due = 360 ชม.) | 32 | 38 |

การแสดงผลใน Timeline เปลี่ยนจาก `SLA 7 วัน / สูงสุด 14 วัน` เป็น `SLA 15 วัน`
เพราะ `target_at` เท่ากับ `due_at` แล้ว

## การตรวจสอบ

- apply บน `solardb_dev` แล้ว รันซ้ำได้ผลเท่าเดิม (idempotent)
- ยังไม่ deploy Production
