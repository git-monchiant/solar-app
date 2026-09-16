# Accounting Payment Notifications

## Goal

เพิ่มการแจ้งเตือนภายในแอปให้ผู้ใช้ Account และ Admin สำหรับงานรับชำระเงิน โดยใช้กระดิ่งและหน้าประวัติเดิม

## Scope

- แจ้งเมื่อมีสลิปใหม่รอตรวจสอบ
- แจ้งเมื่อมีเช็ครอรับ
- หลังรับเช็คแล้ว สร้างรายการรอยืนยันว่าเงินเข้าบริษัท
- กด Notification แล้วเปิดคิวบัญชีพร้อมระบุตำแหน่งรายการที่เกี่ยวข้อง
- สถานะอ่านแยกตามผู้ใช้ และปิดงานอัตโนมัติเมื่อยืนยัน ปฏิเสธ ยกเลิก หรือเช็คมีปัญหา
- ป้องกัน Notification ซ้ำของ payment และเหตุการณ์เดียวกัน แต่เปิดแจ้งเตือนเดิมขึ้นมาใหม่เมื่อมีการส่งสลิปซ้ำ

## Design

- เพิ่ม `accounting_notifications` แยกจาก `quotation_approval_notifications` เพื่อไม่เปลี่ยน foreign key และ semantics ของระบบอนุมัติใบเสนอราคาเดิม
- Notification หนึ่งเหตุการณ์มีสำเนาต่อผู้ใช้ Account/Admin เพื่อเก็บสถานะอ่านแยกกัน
- ใช้ `event_key` ต่อ payment และประเภทงานเป็น idempotency key
- ใช้ `resolved_at` แยกจาก `read_at`: เปิดอ่านไม่เท่ากับงานเสร็จ
- API `/api/notifications` รวม Notification ทั้งสองประเภท และรับ `source` ตอน mark read

## Verification

- TypeScript และ ESLint
- Production build
- ตรวจ query/schema และ event transitions ของสลิปกับเช็ค
- ทดสอบว่า Account scope ไม่ปะปนกับ approval notifications

## Status

Done.

- Added Accounting/Admin per-user notifications for submitted payment evidence, cheque receipt and cheque money confirmation.
- Added resolved state, deduplication, history display and direct pending-queue focus.
- Applied migration `147_accounting_notifications.sql` to `SolarDb_DEV` and backfilled current pending work.
- Verified rollback lifecycle test, Account-scoped live API, ESLint, TypeScript and production build.
- Production migration/deployment was not performed.
