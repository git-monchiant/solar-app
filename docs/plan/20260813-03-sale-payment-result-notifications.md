# Sale Payment Result Notifications

## Goal

แจ้งผลกลับไปยัง Sale ผู้รับผิดชอบ Lead ผ่านกระดิ่ง เมื่อ Account ดำเนินการกับหลักฐานชำระเงิน

## Scope

- แจ้งเมื่อ Account ยืนยันการชำระเงินสำเร็จ
- แจ้งเมื่อ Account ส่งหลักฐานชำระเงินกลับ พร้อมเหตุผล
- ส่งให้ทั้งผู้ใช้ที่ถูกกำหนดเป็น `assigned_user_id` ของ Lead และ Sale ผู้ส่งหลักฐาน (`payments.submitted_by`) ที่ยัง active
- สถานะอ่านแยกต่อผู้ใช้ และป้องกันรายการซ้ำด้วย event key
- กดรายการแล้วเปิด Lead ที่เกี่ยวข้อง

## Verification

- ทดสอบผู้รับ การ deduplicate การอ่าน และการเปิด Lead ด้วย transaction rollback
- Targeted ESLint และ TypeScript
- Production build

## Status

Done.

- Sale เจ้าของ Lead ได้รับกระดิ่งเมื่อ Account อนุมัติเงินโอน/สลิป หรือยืนยันเงินจากเช็คแล้ว
- Sale ได้รับเหตุผลเมื่อ Account ส่งหลักฐานกลับ
- ใช้ schema Notification เดิม จึงไม่ต้องเพิ่ม migration
- ทดสอบ recipient/dedup/target แบบ rollback และตรวจ live API ด้วย Sales role แล้วลบข้อมูลทดสอบเรียบร้อย
- Targeted ESLint, TypeScript และ production build ผ่าน

## Follow-up: Sale ผู้ส่งหลักฐาน

- แก้กรณีผู้ส่งหลักฐานไม่ใช่ Sale ที่ถูก assign ให้ Lead เช่น Lead 591 ถูก assign ให้ Jiranant แต่ sara เป็นผู้ส่งสลิป
- ส่ง Notification ให้ทั้งสองคน และ deduplicate เมื่อเป็นผู้ใช้คนเดียวกัน
- เพิ่ม migration 148 สำหรับ backfill ผลการชำระเงินที่เกิดขึ้นแล้วให้ผู้ส่งหลักฐาน
- ลดรอบ polling ของกระดิ่งจาก 60 วินาทีเป็น 10 วินาที เพื่อให้ผลจาก Account ต่างเครื่องแสดงโดยไม่ต้อง refresh
