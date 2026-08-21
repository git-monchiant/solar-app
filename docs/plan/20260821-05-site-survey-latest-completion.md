# Site Survey Latest Completion

Status: done

## Goal

ให้ SLA `SITE_SURVEY` ใช้วันเวลาของเหตุการณ์ “สำรวจเสร็จและเข้าสู่ขั้นใบเสนอราคา” รายการล่าสุด เมื่อ Lead ถูกย้อนขั้นแล้วกลับเข้าสู่ Quotation มากกว่าหนึ่งครั้ง

## Business Rule

- จุดเริ่ม SLA ยังคงเป็นวันเวลานัดสำรวจที่ยืนยันแล้วตามกติกาเดิม
- จุดสิ้นสุด SLA ใช้กิจกรรม `status_change` ที่มี `new_status = 'quote'` รายการล่าสุด
- หาก SLA เคยเสร็จจากกิจกรรมก่อนหน้า ให้เปลี่ยน `completed_at` และ `completion_activity_id` ไปยังกิจกรรมล่าสุด
- คำนวณสถานะเกินกำหนดใหม่จาก completion ล่าสุด โดยไม่เปลี่ยน SLA ขั้นอื่น
- Timeline ยังคงแสดงประวัติกิจกรรมทั้งหมดเพื่อการตรวจสอบ

## Scope

- ปรับ runtime reconciliation ของ `SITE_SURVEY`
- เพิ่ม regression test สำหรับการเลือก completion ล่าสุดและการ refresh SLA ที่เสร็จแล้ว
- เพิ่ม migration สำหรับ backfill ข้อมูล Development/Production เมื่อได้รับอนุญาต
- ตรวจ TypeScript, ESLint, SLA tests และ production build

## Safety

- จำกัดการ refresh completed SLA เฉพาะ definition ที่ประกาศว่ารองรับ milestone รุ่นใหม่กว่า
- migration ต้อง idempotent และสำรองตาราง SLA ก่อน apply บน Development
- ไม่ deploy Production และไม่สร้าง Git commit โดยไม่ได้รับอนุญาต

## Verification

- Lead ที่มี `new_status = 'quote'` หลายรายการใช้เวลาและ activity id ของรายการล่าสุด
- Lead ที่มีรายการเดียวไม่เปลี่ยนผลลัพธ์
- `started_at`, `target_at` และ `due_at` ของ SITE_SURVEY ยังคงอิงนัดหมายเดิม
- `breached_at` สอดคล้องกับ completion ล่าสุด
- Test, TypeScript, ESLint และ Next production build ผ่าน

## Result

- Runtime เลือก `status_change` ที่เข้าสู่ `quote` รายการล่าสุด และอนุญาตให้ refresh completed milestone เฉพาะ `SITE_SURVEY`
- Policy `SITE_SURVEY` v5 ระบุ completion rule เป็น `latest_quote_transition`
- migration 170 ผ่าน transaction rollback สองรอบและ apply บน `solardb_dev` แล้ว
- ปรับข้อมูลเดิม 23 Lead และสร้าง audit event `completion_changed` โดยไม่เหลือ mismatch หรือ event key ซ้ำ
- Lead 812 เปลี่ยน completion จาก 19 ก.ค. 2569 09:33:47 (activity 3934) เป็น 20 ก.ค. 2569 09:23:15 (activity 3959) โดยคง start/due เดิมและยังเสร็จใน SLA
- สำรองข้อมูลไว้ที่ `sla_policies_bak_20260821_130235`, `lead_sla_instances_bak_20260821_130235`, `lead_sla_events_bak_20260821_130235`
- SLA tests, TypeScript, targeted ESLint และ Next production build 96 routes ผ่าน
- ยังไม่ deploy Production และยังไม่สร้าง Git commit
