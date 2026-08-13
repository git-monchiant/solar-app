# Quotation Approval Notifications

## Goal

เพิ่มระบบแจ้งเตือนภายในแอปสำหรับขั้นตอนอนุมัติใบเสนอราคา Sale → Solar Sup → Sale Sup โดยไม่เชื่อมต่อ LINE

## Scope

- แสดง badge จำนวนใบเสนอราคาที่รออนุมัติตาม role ที่กำลังใช้งาน
- สร้าง Notification Center สำหรับรายการที่ยังไม่อ่านและประวัติแจ้งเตือน
- แจ้ง Solar Sup อัตโนมัติเมื่อ Sale ส่งขออนุมัติ
- แจ้ง Sale Sup อัตโนมัติเมื่อ Solar Sup อนุมัติ
- แจ้งผู้ส่งใบเสนอราคาเมื่ออนุมัติครบหรือถูกส่งกลับแก้ไข
- เพิ่มปุ่มเตือนผู้อนุมัติบนการ์ดใบเสนอราคา โดยจำกัดการกดซ้ำ 1 ชั่วโมงต่อใบและขั้นอนุมัติ
- เก็บ audit ของผู้กดเตือน เวลา และขั้นอนุมัติ

## Design

### Database

- `quotation_approval_notifications` เก็บ notification รายผู้ใช้และสถานะอ่าน
- `quotation_approval_reminders` เก็บประวัติการกดเตือนและใช้ตรวจ cooldown
- notification อ้างอิง `quotation_id` และ `lead_id` เพื่อเปิดไปยังงานที่เกี่ยวข้องได้โดยตรง

### API

- `GET /api/notifications` รายการแจ้งเตือนของผู้ใช้และจำนวนที่ยังไม่อ่าน
- `PATCH /api/notifications` ทำเครื่องหมายอ่านทีละรายการหรือทั้งหมด
- `POST /api/quotations/[id]/remind` ส่งการเตือนภายในแอปไปยังผู้ใช้ active ที่มี role ของขั้นปัจจุบัน
- `GET /api/quotation-approvals/count` จำนวนรายการรอตาม active role

### UI

- เพิ่มเมนู Notifications พร้อม unread badge
- เพิ่ม badge บนเมนู Quotation Approvals
- เพิ่มหน้า `/notifications`
- เพิ่มปุ่ม `เตือน Solar Sup` หรือ `เตือน Sale Sup` บนการ์ดใบเสนอราคา พร้อมเวลาเตือนล่าสุด

## Authorization and Safety

- อ่านและ mark read ได้เฉพาะ notification ของตนเอง
- ปุ่มเตือนใช้ได้เฉพาะผู้สร้าง/ผู้ส่งใบเสนอราคา, ผู้มีสิทธิ์จัดการใบเสนอราคา หรือ Admin
- ตรวจสถานะ quotation ฝั่ง server ทุกครั้งก่อนสร้าง notification
- ใช้ transaction และ cooldown ฝั่ง server เพื่อกันการกดซ้ำพร้อมกัน
- ไม่เรียก LINE API และไม่ใช้ `leads.line_id`

## Verification

- ทดสอบ API authorization, role routing, cooldown และ read state
- ตรวจ badge แยก Solar Sup / Sale Sup / Admin
- รัน ESLint, TypeScript/Next build และตรวจ git diff ว่าไม่แตะไฟล์งานเดิม

## Result

- Implemented in-app notification, unread badge, approval queue badge and 1-hour reminder cooldown
- Applied migration `144_quotation_approval_notifications.sql` to `SolarDb_DEV`
- Verified notification insert/read/cooldown in a rolled-back Development transaction
- Verified live Development endpoints for summary, approval count, notification page and invalid-state reminder guard
- Targeted ESLint passed with one pre-existing `<img>` warning; TypeScript and Next.js production build passed
- LINE integration was not added

## Follow-up: Header Notification Bell

- ย้ายทางเข้าหลักของ Notification ไปเป็นไอคอนกระดิ่งด้านขวาบนของ Header
- กระดิ่งแสดง unread badge และเปิด dropdown รายการล่าสุดได้จากทุกหน้าที่ใช้ Header
- คงหน้า `/notifications` สำหรับดูประวัติทั้งหมด
- นำเมนู Notifications ออกจาก sidebar และ bottom navigation เพื่อลดความซ้ำซ้อน
- คง badge ของ Quotation Approvals เพื่อสื่อจำนวนงานอนุมัติที่ยังค้าง

Follow-up result:

- Added a reusable Header notification bell with unread badge and latest-8 dropdown
- Added the bell to the custom Lead detail header as well as the shared Header
- Removed duplicate Notifications entries from desktop and mobile navigation
- Kept the full notification history page and Quotation Approvals pending badge
- Adjusted the mobile Role Switcher width so the page title and bell remain visible
- Verified the open dropdown visually at desktop 1440×900 and mobile 390×844
- Final ESLint had no errors, and the isolated Next.js production build passed
