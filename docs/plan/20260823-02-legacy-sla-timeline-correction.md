# ซ่อม Timeline จาก SLA ย้อนหลังและ Rollback

วันที่: 2026-08-23  
สถานะ: done

## เป้าหมาย

ทำให้ Timeline ของ Lead เก่าเรียงตามเหตุการณ์ธุรกิจที่ตรวจสอบได้ โดยไม่ใช้เวลา backfill เป็นเวลาทำงานจริง และไม่ใช้การ rollback เป็นหลักฐานปิด SLA ของขั้น Survey

## ขอบเขต

1. Grade ที่ไม่มี `grade_change` Activity แสดงเป็นข้อมูลเดิมที่ไม่ทราบเวลา และไม่รวมกับแถว SLA backfill
2. `BOOK_SURVEY` ที่เสร็จแล้วเปลี่ยน anchor ย้อนหลังจากกติกาเก่าเป็นเวลายืนยันชำระค่าจอง เมื่อหลักฐานรองรับ
3. `SITE_SURVEY` ปิดด้วย transition จาก `survey → quote` เท่านั้น ไม่รวม rollback จากขั้นหลังกลับมาที่ Quotation
4. เพิ่ม migration แบบ idempotent พร้อม audit event และสำรองข้อมูลก่อน apply บน `solardb_dev`
5. ตรวจ Lead 882 และตรวจผลกระทบทั้งฐาน รวมถึง test, TypeScript, ESLint และ build

## เกณฑ์สำเร็จ

- Lead 882 เรียง Pre-Survey เป็น ติดต่อ → Grade เดิม (ไม่ระบุเวลาปลอม) → ออกใบจอง → ยืนยันเงิน → SLA นัดสำรวจ
- `SITE_SURVEY` ของ Lead 882 จบที่ Activity 4627 วันที่ 31 ก.ค. ไม่ใช่ rollback Activity 4751 วันที่ 4 ส.ค.
- ไม่มี `SITE_SURVEY` ที่อ้าง rollback เป็น completion หลัง migration
- ไม่มี `BOOK_SURVEY` ที่มีเวลาจบก่อนเวลาเริ่มหลัง migration
- migration รันซ้ำได้โดยไม่สร้าง audit ซ้ำ

## ผลลัพธ์

- Timeline ซ่อน SLA ประเมิน Grade เมื่อไม่มี `grade_change` Activity และแสดง Grade เป็นข้อมูลเดิมที่ไม่มีประวัติเวลาแทน
- Runtime `SITE_SURVEY` v6 เลือกเฉพาะ transition `survey → quote`; rollback ไป Quotation ไม่ใช่ completion อีกต่อไป
- migration 176 ซ่อมหลักฐาน SITE_SURVEY และ migration 177 re-anchor BOOK_SURVEY ที่เสร็จแล้วไปยังเวลายืนยันชำระเงิน พร้อม fallback `appointment_before_payment` สำหรับข้อมูลเก่าที่นัดก่อนยืนยันเงิน
- สำรอง `solardb_dev` เป็น `sla_policies_bak_20260823_143750`, `lead_sla_instances_bak_20260823_143750`, `lead_sla_events_bak_20260823_143750`
- apply migration 176/177 บน `solardb_dev` และรันซ้ำผ่าน: rollback completion เหลือ 0, BOOK_SURVEY เวลาติดลบเหลือ 0, audit ไม่เพิ่มซ้ำ
- Lead 882: BOOK_SURVEY v5 เริ่ม 27 ก.ค. 17:13 จาก payment และจบ 17:13 ที่ appointment Activity 4356; SITE_SURVEY v6 จบ 31 ก.ค. ที่ forward Activity 4627 ไม่ใช่ rollback 4751
- `npm run test:sla`, TypeScript, targeted ESLint และ Next production build 97 routes ผ่าน; ESLint เหลือ warning เดิม 3 จุดในหน้า Lead
- ยังไม่ deploy Production
