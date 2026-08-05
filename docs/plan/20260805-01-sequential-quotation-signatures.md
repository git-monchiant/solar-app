# Sequential Quotation Signatures

Status: `done`

## Objective

ปรับการลงลายเซ็นใบเสนอราคาให้ตรงกับลำดับอนุมัติจริง โดย Solar Sup และ Sale Sup ต้องลงนามแยกกันในขั้นของตนเอง และเอกสารต้องเก็บลายเซ็นเป็น Snapshot ของ Revision ที่ตรวจ

## Scope

- เพิ่ม Snapshot ชื่อ ตำแหน่ง URL ข้อมูลภาพ และ MIME ของ Solar Sup ใน `quotations`
- เมื่อ Solar Sup อนุมัติ ต้องมีลายเซ็นใน User Profile และบันทึก Snapshot พร้อมเวลาอนุมัติ
- เมื่อ Sale Sup อนุมัติขั้นสุดท้าย ใช้ Snapshot ของ Sale Sup แยกจาก Solar Sup ตามเดิม
- เมื่อส่งกลับแก้ไข ให้ล้างสถานะและ Snapshot ลายเซ็นของ approval round ปัจจุบัน โดยเก็บประวัติไว้ใน `quotation_approval_events`
- ปรับ PDF ให้แสดง 4 ช่อง: ลูกค้า, ผู้จัดทำเอกสาร, Solar Sup, Sale Sup
- แสดงชื่อ ตำแหน่ง และวันที่ของผู้อนุมัติแต่ละขั้น
- ไม่ส่งข้อมูลภาพลายเซ็นแบบ binary ออกทาง Quotation JSON API
- จำกัดการแก้/ลบลายเซ็น User ให้ทำได้เฉพาะเจ้าของลายเซ็นหรือ Admin

## Data Migration

เพิ่มคอลัมน์แบบ idempotent:

- `solar_approver_name_snapshot`
- `solar_approver_title_snapshot`
- `solar_approver_signature_url_snapshot`
- `solar_approver_signature_data_snapshot`
- `solar_approver_signature_mime_snapshot`

## Verification

- ตรวจ schema หลังรัน migration
- ตรวจ transition: submit → Solar Sup approve → Sale Sup approve
- ตรวจว่าขั้น Solar Sup และ Sale Sup ปฏิเสธผู้ใช้ที่ไม่มีลายเซ็น
- ตรวจว่าการส่งกลับล้าง Snapshot รอบปัจจุบัน
- ตรวจ PDF/HTML ว่าแสดงลายเซ็นตามสถานะและไม่แสดงลายเซ็นซ้ำ
- รัน lint, tests ที่เกี่ยวข้อง และ production build

## Deployment

ไม่มีการ Deploy environment ใดในแผนนี้ การ Deploy ต้องขออนุญาตผู้ใช้แยกต่างหาก

## Result

- เพิ่มและ apply migration `138_sequential_quotation_signatures.sql` ที่ `SolarDb_DEV` แล้ว
- Solar Sup และ Sale Sup ลงนามเป็น Snapshot แยกตามลำดับ
- ส่งกลับแก้ไขแล้วล้างลายเซ็นของ approval round ปัจจุบัน
- PDF แสดงลูกค้า, ผู้จัดทำเอกสาร, Solar Sup และ Sale Sup โดยไม่ลงลายเซ็นผู้จัดทำซ้ำ
- จำกัด PUT/DELETE ลายเซ็น User ให้เฉพาะเจ้าของหรือ Admin
- Quotation tests, lint และ production build ผ่าน
- PDF จริงผ่านทั้ง 2 หน้าและ bundle 17 หน้า
- Integration test ของ approve/return/missing-signature ผ่าน และลบข้อมูลทดสอบหมดแล้ว
