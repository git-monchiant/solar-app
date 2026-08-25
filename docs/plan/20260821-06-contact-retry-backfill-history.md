# Contact Retry Backfill History

Status: done

## Goal

ซ่อมข้อมูล `CONTACT_RETRY` ที่ migration 166 ข้ามครั้งที่ 1–3 เพราะวันครบกำหนดผ่านไปแล้ว ให้ Timeline แสดงลำดับติดตามลูกค้าครบครั้งที่ 1–4 ตามกิจกรรมติดต่อจริง

## Business Rule

- ใช้กิจกรรมติดต่อไม่ได้ครั้งแรกเป็น anchor ของบันได Day 3/5/7/30
- สร้าง SLA ทั้ง 4 ครั้ง แม้วันครบกำหนดผ่านไปแล้ว
- นำกิจกรรมติดต่อครั้งถัดไปมาเสร็จ SLA ที่ยังเปิดและครบกำหนดก่อนสุด ครั้งละหนึ่งรายการ ตามพฤติกรรม runtime
- รอบที่ไม่มีกิจกรรมมาปิดและเลยกำหนดแล้วต้องเป็น `breached`
- รอบอนาคตยังเป็นสถานะเปิดตาม warning/due ปัจจุบัน
- เก็บ `completed_at`, `completion_activity_id`, `breached_at` และ audit event ให้ตรวจสอบย้อนหลังได้

## Scope

- เพิ่ม migration 171 สำหรับ Lead ที่ถูก backfill โดย migration 166 เท่านั้น
- อัปเดต `next_follow_up` ให้ตรงกับรอบเปิดที่ครบกำหนดก่อนสุด
- ตรวจผล Lead 880 และ Lead ที่ได้รับผลกระทบทั้งหมดบน `solardb_dev`
- รัน SLA tests, TypeScript, ESLint และ production build

## Safety

- migration ต้อง forward-only และ idempotent
- dry-run ภายใน transaction และ rollback อย่างน้อยสองรอบก่อน apply
- สำรองตาราง `leads`, `lead_sla_instances` และ `lead_sla_events` ก่อน apply Development
- ไม่ deploy Production และไม่สร้าง Git commit โดยไม่ได้รับอนุญาต

## Verification

- Lead 880 แสดงครั้งที่ 1–4 ครบ
- ครั้งที่ 1 เสร็จ 29 ก.ค. 2569, ครั้งที่ 2 เสร็จ 6 ส.ค. 2569, ครั้งที่ 3 เกินกำหนด และครั้งที่ 4 กำลังดำเนินการ
- ไม่มี duplicate instance key หรือ duplicate event key
- rerun migration แล้วข้อมูลไม่เปลี่ยน
- Test, TypeScript, ESLint และ Next production build ผ่าน

## Result

- migration 171 สร้าง CONTACT_RETRY ครั้งที่ 1–3 ที่ migration 166 เคยข้าม และคงครั้งที่ 4 เดิมไว้
- replay กิจกรรมติดต่อตามลำดับเดียวกับ runtime พร้อมบันทึก completion/breach และ audit event
- ซ่อม 4 Lead บน `solardb_dev`; ทุก Lead มีครบ 4 รอบ รวม 16 instances และไม่มี duplicate instance/event key
- Lead 880: ครั้งที่ 1 เสร็จ 29 ก.ค. ภายใน SLA, ครั้งที่ 2 เสร็จ 6 ส.ค. เกิน SLA, ครั้งที่ 3 เกินกำหนด, ครั้งที่ 4 กำลังดำเนินการ
- `next_follow_up` ของ Lead 880 ชี้รอบเปิดที่ครบกำหนดก่อนสุด คือครั้งที่ 3 วันที่ 3 ส.ค. 2569
- migration ผ่าน dry-run/rollback สองรอบและ rerun แล้วข้อมูลไม่เปลี่ยน
- สำรองข้อมูลไว้ที่ `leads_bak_20260821_132717`, `lead_sla_instances_bak_20260821_132717`, `lead_sla_events_bak_20260821_132717`
- SLA tests, TypeScript, targeted ESLint และ Next production build 96 routes ผ่าน
- ไม่สามารถตรวจภาพหน้าเว็บอัตโนมัติได้เพราะไม่มี browser session แต่ตรวจข้อมูลที่ API/Timeline ใช้โดยตรงแล้ว
- ยังไม่ deploy Production และยังไม่สร้าง Git commit
