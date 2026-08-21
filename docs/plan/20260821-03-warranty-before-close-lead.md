# Warranty Before Close Lead

Status: done

> Superseded by [20260821-04-close-lead-at-warranty-issued.md](20260821-04-close-lead-at-warranty-issued.md): ผู้ใช้ยืนยันภายหลังว่าเวลา “ปิด Lead” ต้องเท่ากับเวลาออกใบรับประกัน และ SLA 3 วันต้องวัดจากติดตั้งเสร็จถึงออกใบรับประกัน

## Goal

ปรับขั้นตอนหลังติดตั้งเสร็จให้เรียงเป็นออกใบรับประกันก่อน แล้วจึงปิด Lead และลด SLA สำหรับการปิด Lead จาก 7 วันเป็น 3 วัน

## Scope

- ตรวจ milestone และ SLA ในกลุ่ม Warranty / After Sales
- ให้ CLOSE_LEAD เริ่มหลังออกใบรับประกัน ไม่เริ่มทันทีหลังติดตั้งเสร็จ
- เปลี่ยน SLA ปิด Lead เป็น 3 วัน
- ปรับ Timeline และข้อมูล SLA เดิมใน `solardb_dev` ให้สอดคล้องกัน
- เพิ่ม regression tests และตรวจ production build

## Safety

- สำรองตาราง SLA ก่อน migration
- ทดสอบ migration ภายใน transaction และ rollback ก่อน apply จริง
- ไม่ deploy Production และไม่สร้าง Git commit โดยไม่ได้รับอนุญาต

## Verification

- Timeline เรียง ติดตั้งเสร็จ → ออกใบรับประกัน → ปิด Lead
- CLOSE_LEAD เริ่มจากเวลาออกใบรับประกันและกำหนด 3 วัน
- Lead ที่ยังไม่ออกใบรับประกันต้องไม่มี CLOSE_LEAD SLA ที่กำลังเปิด
- Test, TypeScript, ESLint และ Next production build ผ่าน

## Result

- CLOSE_LEAD เริ่มเมื่อทั้งงานติดตั้งและใบรับประกันเสร็จ โดยใช้เวลาที่เกิดทีหลังเป็น anchor
- Timeline แสดงออกใบรับประกันก่อนแถว SLA ปิด Lead และซ่อนแถวเปลี่ยนสถานะที่ซ้ำกับการปิดงานติดตั้ง
- เปลี่ยน SLA ปิด Lead จาก 7 วันเป็น 3 วัน พร้อมเตือนล่วงหน้า 1 วัน
- API ปฏิเสธการปิด Lead หากยังไม่ได้ออกใบรับประกัน
- Migration 168 ผ่าน dry-run/rollback และ idempotency ก่อน apply บน `solardb_dev`
- Lead 691 เริ่ม CLOSE_LEAD เวลาออกใบรับประกัน 11 ก.ค. 2569 13:28 และครบกำหนด 14 ก.ค. 2569 13:28
- หลัง migration มี CLOSE_LEAD ที่มองเห็น 3 รายการ ทุกแถวเป็น SLA 3 วัน และไม่มีรายการเปิดก่อนออกใบรับประกัน
- สำรองข้อมูลไว้ที่ `sla_policies_bak_20260821_115835`, `lead_sla_instances_bak_20260821_115835`, `lead_sla_events_bak_20260821_115835`
- SLA tests, TypeScript, targeted ESLint และ Next production build 96 routes ผ่าน; ไม่มี browser session สำหรับ visual QA
- ยังไม่ deploy Production และยังไม่สร้าง Git commit
