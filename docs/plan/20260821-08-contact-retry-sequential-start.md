# Contact Retry Sequential Start

Status: done

## Goal

เปลี่ยน `CONTACT_RETRY` ให้แต่ละครั้งมีวันเริ่มจริงแบบต่อเนื่อง ไม่ใช้เวลาติดต่อไม่สำเร็จครั้งแรกเป็น `started_at` ร่วมกันทุกครั้ง

## Business Rule

- ครั้งที่ 1 เริ่มเมื่อบันทึกว่าติดต่อ Lead ครั้งแรกไม่สำเร็จ และครบกำหนดอีก 3 วัน
- ครั้งที่ 2 เริ่มเมื่อบันทึกผลครั้งที่ 1 และครบกำหนดอีก 5 วัน
- ครั้งที่ 3 เริ่มเมื่อบันทึกผลครั้งที่ 2 และครบกำหนดอีก 7 วัน
- ครั้งที่ 4 เริ่มเมื่อบันทึกผลครั้งที่ 3 และครบกำหนดอีก 30 วัน
- ระบบมี CONTACT_RETRY ที่เปิดอยู่ครั้งละหนึ่งรายการเท่านั้น
- ถ้าติดต่อได้หรือข้อมูลติดต่อไม่ถูกต้อง ให้จบบันไดและไม่สร้างครั้งถัดไป
- ถ้ายังติดต่อไม่ได้ ให้สร้างครั้งถัดไป ณ เวลากิจกรรมเดียวกับที่ปิดครั้งปัจจุบัน

## Scope

- ปรับ runtime creation/completion ของ CONTACT_RETRY
- เพิ่ม policy version สำหรับ sequential actual-start
- เพิ่ม migration แปลงข้อมูลจาก migration 171 และข้อมูล CONTACT_RETRY เดิม
- เพิ่ม regression tests สำหรับ deadline ที่เริ่มจากกิจกรรมก่อนหน้า
- ตรวจข้อมูล Lead 880 บน `solardb_dev`

## Safety

- เก็บรายการอนาคตที่ยังไม่ควรเริ่มเป็น `superseded` แทนการลบ
- migration ต้อง forward-only และ idempotent พร้อม audit event
- dry-run/rollback อย่างน้อยสองรอบและสำรองตารางก่อน apply Development
- ไม่แตะไฟล์แผน/ม็อกอัป SLA Dashboard หมายเลข 07 ที่มีอยู่ใน worktree
- ไม่ deploy Production และไม่สร้าง Git commit โดยไม่ได้รับอนุญาต

## Verification

- Lead 880: ครั้งที่ 1 เริ่ม 27 ก.ค., ครั้งที่ 2 เริ่ม 29 ก.ค., ครั้งที่ 3 เริ่ม 6 ส.ค. และครั้งที่ 4 ยังไม่เริ่ม
- แต่ละรายการมี `due_at = started_at + 3/5/7/30 วัน` ตาม sequence
- ทุก Lead มีงาน CONTACT_RETRY ที่ยังไม่เสร็จและไม่ superseded ไม่เกินหนึ่งรายการ
- การบันทึกผลติดต่อไม่ได้สร้างครั้งถัดไปเพียงหนึ่งรายการ
- Test, TypeScript, ESLint และ Next production build ผ่าน

## Result

- runtime สร้าง CONTACT_RETRY ครั้งละหนึ่งรายการ และสร้างครั้งถัดไปเมื่อกิจกรรมติดต่อไม่ได้ปิดครั้งปัจจุบัน
- เพิ่ม policy `CONTACT_RETRY` v2 แบบ `SEQUENTIAL_CALENDAR_DAYS`
- migration 172 แปลงข้อมูลเดิมโดยเปลี่ยน `started_at` เป็นกิจกรรมก่อนหน้า และเก็บงานอนาคตที่ยังไม่เริ่มเป็น `superseded`
- Lead 880: ครั้งที่ 1 เริ่ม 27 ก.ค. 15:15, ครั้งที่ 2 เริ่ม 29 ก.ค. 11:42, ครั้งที่ 3 เริ่ม 6 ส.ค. 13:48; ครั้งที่ 4 ยังไม่เริ่มและไม่แสดงใน Timeline
- ครั้งที่ 1/2/3 มีช่วง SLA 3/5/7 วันจาก `started_at` ของตัวเอง และ `next_follow_up` ชี้ครั้งที่ 3 วันที่ 13 ส.ค. 2569
- Lead ที่มี CONTACT_RETRY ทุกใบมีงานเปิดไม่เกินหนึ่งรายการ; ไม่มี window ผิด, duplicate instance key หรือ duplicate event key
- migration ผ่าน dry-run/rollback สองรอบและ rerun แล้วข้อมูลไม่เปลี่ยน
- สำรองข้อมูลไว้ที่ `sla_policies_bak_20260821_140329`, `leads_bak_20260821_140329`, `lead_sla_instances_bak_20260821_140329`, `lead_sla_events_bak_20260821_140329`
- SLA regression tests, TypeScript, targeted ESLint และ Next production build 96 routes ผ่าน
- ยังไม่ deploy Production และยังไม่สร้าง Git commit
