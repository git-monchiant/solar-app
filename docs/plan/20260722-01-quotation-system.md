# Quotation System Implementation Plan

## Status

`in-progress`

## Implementation Progress — 2026-07-22

Implemented in Development:

- Added idempotent migration `scripts/_archive/migrations/126_quotation_system.sql` and applied it to `SolarDb_DEV` only.
- Added `sales_sup`, user job title, Package Item Master, Payment Template, Quotation/Item/Approval Event tables.
- Seeded 183 active equipment rows across all 23 current Packages.
- Added the 3-card Quotation Builder, Package snapshot, locked master items, Add-on/Custom items, discount, paid deposit, VAT and editable 20/80 terms.
- Added submit/approve/request-changes permissions, Sale Sup queue, signature snapshot and lead Activity Log.
- Added post-approval Revision creation that preserves the approved snapshot and starts a new draft/document number.
- Added draft/approved two-page PDF matching the sample document's Letter size (612 × 792 pt) and `SM-QT-YY-XXXX` numbering.
- Added approved-quotation handoff to the existing Order selection while retaining legacy uploads.
- Verified route compilation, core CRUD, approval flow and PDF generation in the local Development app. Temporary test quotation was removed afterward.

Pending before this plan can be marked `done`:

- Business UAT by Sales, Sale Sup and Account.
- Confirm final company/bank/QR wording and equipment detail against all 23 Package sheets.
- Complete the full role/PDF regression matrix.
- Production deployment (requires explicit user approval).

## Objective

พัฒนาระบบสร้างใบเสนอราคาจาก Package Master ภายใน Step 03 ของ Lead ให้ Sales สามารถสร้างได้สูงสุด 3 ฉบับต่อ Lead เพิ่ม Add-on หรือรายการพิเศษ คำนวณราคา/ส่วนลด/เงินจอง สร้าง PDF ตามรูปแบบ Excel ตัวอย่าง และส่งให้ Sale Sup อนุมัติก่อนส่งลูกค้า

## Confirmed Decisions

- 1 Lead มีใบเสนอราคาได้สูงสุด 3 ฉบับ และลูกค้าจะเลือก 1 ฉบับใน Order step
- แต่ละใบเลือก Package หลักต่างกันได้
- รายละเอียดอุปกรณ์หลักยึดจาก Package Master และห้ามแก้ทับต้นฉบับ
- เพิ่ม Add-on จาก Master หรือรายการอุปกรณ์/บริการอื่น โดยระบุชื่อ จำนวน และราคาได้
- ใบเสนอราคาต้องเก็บ Snapshot ของ Package, อุปกรณ์, ราคา และเงื่อนไข
- รองรับส่วนลดแบบจำนวนเงินและเปอร์เซ็นต์ พร้อมเหตุผล
- เงินจองเป็นยอดชำระแล้ว แยกจากส่วนลด
- Approval ระยะแรกเป็นชั้นเดียวเฉพาะ Quotation
- เพิ่ม Role `sales_sup` แสดงชื่อ `Sale Sup` ทำหน้าที่อนุมัติใบเสนอราคา
- เลขที่ใบเสนอราคาใช้รูปแบบตามเอกสารตัวอย่าง `SM-QT-YY-XXXX`
- Sale Sup สามารถอนุมัติใบเสนอราคาที่ตนเองเป็นผู้สร้างได้
- เงื่อนไขชำระเงินเริ่มจาก Template ที่เลือก และอนุญาตให้แก้ไขรายละเอียดของใบเสนอราคาแต่ละฉบับได้
- PDF Approved แสดงภาพลายเซ็นของผู้อนุมัติจาก User Profile พร้อมชื่อ ตำแหน่ง และวันที่อนุมัติ
- ส่วนลดมีช่อง `ชื่อส่วนลด` แบบกรอกข้อความ เช่น `ส่วนลดพิเศษ VIP` ควบคู่กับจำนวน/เปอร์เซ็นต์และเหตุผล
- เฉพาะ Sales เจ้าของ Lead เท่านั้นที่ส่ง Approved PDF ให้ลูกค้าได้ โดย Admin เป็นสิทธิ์สำรอง; Sale Sup ดูและดาวน์โหลดได้แต่ไม่ส่ง
- ยังไม่ทำ Technical Approval หรือ Approval Matrix หลายระดับ
- PDF ใช้รูปแบบหลักจากไฟล์ตัวอย่าง เป็นกระดาษ Letter แนวตั้ง 2 หน้า (612 × 792 pt ตามขนาดจริงของไฟล์ต้นฉบับ)

## Out of Scope

- Technical Approval โดย Solar
- Margin/cost calculation และการปกปิดต้นทุน
- Approval ตามวงเงินหรือเปอร์เซ็นต์ส่วนลดหลายระดับ
- Digital signature ของลูกค้า
- E-signature provider ภายนอก
- การส่งอีเมล/LINE อัตโนมัติแบบเต็มรูปแบบ นอกเหนือจากการใช้กลไกส่งเอกสารเดิม
- การ Deploy ทุก Environment โดยอัตโนมัติ

## Current Baseline

- Step 03 ปัจจุบันรองรับไฟล์ใบเสนอราคาสูงสุด 3 ช่องใน `quotation_files`
- Order step รองรับการเลือกใบเสนอราคาที่ลูกค้ายอมรับผ่าน `quotation_accepted_idx`
- ระบบมีเลขเอกสาร Quotation และเก็บ `quotation_amount`, `quotation_doc_no`, `quotation_by`, `quotation_sent_date`
- Role ปัจจุบันคือ `admin`, `sales`, `solar`, `leadsseeker`, `account`
- Package Active ปัจจุบัน 23 รายการ
- Excel ตัวอย่างมี 22 ชีต: On-grid 5, Hybrid 5, Scale Up Battery/Battery+Panel 8 และเพิ่มแผง 4
- Package `Battery 4.8 kWh ZTT` ราคา 41,900 บาทยังไม่มี Template ใน Excel
- Mockup อ้างอิงอยู่ที่ `docs/mockup/20260720-02-quotation-package-options/`

## Target Workflow

### Sales

1. เปิด Step 03 Quotation
2. สร้างชุด 1, 2 หรือ 3
3. เลือก Package หลัก
4. ระบบโหลดอุปกรณ์ ราคา และ Terms Profile จาก Package Master
5. เลือก Add-on หรือเพิ่มรายการอื่น
6. ระบุส่วนลด เงินจอง เงื่อนไขชำระ และหมายเหตุ
7. ดู PDF Preview ที่มีลายน้ำ `DRAFT / รออนุมัติ`
8. กด `ส่งขออนุมัติ`

### Sale Sup

1. เปิดรายการ `Quotation Approvals`
2. ตรวจข้อมูลลูกค้า Package รายการเพิ่ม ราคา ส่วนลด เงินจอง และ PDF Preview
3. เลือก `อนุมัติ` หรือ `ส่งกลับแก้ไข`
4. การส่งกลับต้องระบุเหตุผล
5. เมื่ออนุมัติแล้ว ระบบสร้าง/เปิดใช้ PDF ตัวจริงและอนุญาตให้ส่งลูกค้า

### Status per Quotation

```text
draft
  -> pending_approval
       -> approved
       -> changes_required -> draft
```

- ใบเสนอราคา 3 ฉบับมีสถานะแยกกัน
- Sales ส่งหลายฉบับขออนุมัติพร้อมกันได้ แต่ Sale Sup อนุมัติแยกเป็นรายฉบับ
- แก้ Package, item, ราคา, ส่วนลด, เงินจอง หรือเงื่อนไขหลังอนุมัติ ต้องสร้าง Revision และกลับไปขออนุมัติใหม่
- Admin มีสิทธิ์อนุมัติ/ส่งกลับได้เป็น fallback และต้องบันทึก Activity Log

## Data Model

### 1. Role

- เพิ่ม `sales_sup` ใน Role type, Role label, user management และ permission checks
- รองรับ `job_title` และภาพ `signature_url` ใน User Profile สำหรับผู้อนุมัติ
- ไม่ใช้ Active Role ฝั่ง UI เป็นหลักฐานสิทธิ์อนุมัติ ฝั่ง API ต้องตรวจ Role จริงจากฐานข้อมูลทุกครั้ง

### 2. `quotations`

ฟิลด์หลักที่เสนอ:

- `id`, `lead_id`, `option_no` (1-3)
- `doc_no`, `revision_no`
- `status`
- `package_id`
- `package_name_snapshot`, `package_price_snapshot`
- `issue_date`, `valid_days`, `expire_date`
- `subtotal_incl_vat`
- `discount_label`, `discount_type`, `discount_value`, `discount_amount`, `discount_reason`
- `contract_total_incl_vat`
- `deposit_paid_amount`
- `outstanding_amount`
- `vat_rate`, `amount_before_vat`, `vat_amount`
- `payment_terms_profile`, `terms_profile`
- `note`
- `pdf_url`, `pdf_generated_at`
- `created_by`, `created_at`, `updated_by`, `updated_at`
- `submitted_by`, `submitted_at`
- `approved_by`, `approved_at`
- `approver_name_snapshot`, `approver_title_snapshot`, `approver_signature_url_snapshot`
- `approval_note`

กำหนด Unique Constraint ที่ `(lead_id, option_no, revision_no)` และตรวจจำนวน Active option ไม่เกิน 3 ฉบับต่อ Lead ฝั่ง API

### 3. `quotation_items`

- `quotation_id`
- `source_type`: `package`, `addon`, `custom`
- `source_id` สำหรับ Package Item/Add-on Master
- `sort_order`
- `name_snapshot`, `description_snapshot`
- `quantity`, `unit`
- `unit_price`, `line_total`
- `is_price_included` สำหรับรายการมาตรฐานที่รวมในราคา Package

รายการ `package` สร้างจาก Package Master และไม่ให้ Sales ลบหรือแก้ทับ ส่วน `addon` และ `custom` เพิ่ม/ลบได้ก่อนส่งอนุมัติ

### 4. `quotation_installments`

- `quotation_id`, `installment_no`
- `label`
- `percentage` หรือ `fixed_amount`
- `amount`
- `due_rule`, `due_days`, `description`

ระบบต้องตรวจว่ายอดทุกงวดรวมกันเท่ากับ `outstanding_amount` โดยโยนส่วนต่างจากการปัดเศษไปงวดสุดท้าย

### 5. `quotation_approval_events`

- `quotation_id`, `revision_no`
- `action`: `submitted`, `approved`, `changes_required`
- `actor_user_id`, `actor_role`
- `note`, `created_at`

ใช้เก็บประวัติ Approval โดยไม่เขียนทับเหตุการณ์เดิม และสะท้อนไปยัง Lead Activity Log

### 6. Package Item Master / Terms Profile

- ตรวจ schema Package ปัจจุบันและสร้าง child items ที่รองรับอุปกรณ์หลายรายการต่อ Package
- Import รายการอุปกรณ์จาก Excel 22 ชีตเป็นข้อมูลตั้งต้น
- สร้างข้อมูล Package `Battery 4.8 kWh ZTT` ที่ขาด โดยให้เจ้าของข้อมูลยืนยันรายการอุปกรณ์และ Terms
- แยก Terms Profile อย่างน้อย:
  - `new_installation`: รับประกันงานติดตั้งและ O&M
  - `scale_up`: รับประกันเฉพาะอุปกรณ์/งานที่ติดตั้งเพิ่ม

## Pricing Rules

ใช้สูตรกลางเดียวใน API และ PDF:

```text
ราคาแพ็กเกจรวม VAT
+ รายการเพิ่มรวม VAT
= ยอดก่อนส่วนลดรวม VAT

ยอดก่อนส่วนลด
- ส่วนลด
= ราคาสัญญาหลังส่วนลดรวม VAT

ราคาสัญญาหลังส่วนลด
- เงินจองที่รับแล้ว
= ยอดคงเหลือที่ต้องชำระ
```

- `amount_before_vat` และ `vat_amount` แยกจากราคาสัญญาหลังส่วนลดตาม VAT 7%
- เงินจองไม่ใช่ส่วนลด และไม่ลดมูลค่าสัญญา
- ยอดงวดชำระคำนวณจากยอดคงเหลือหลังหักเงินจอง
- ค่าเงินคำนวณแบบ Decimal ฝั่ง Server ห้ามใช้ floating point จาก Browser เป็นแหล่งจริง
- Account ต้องยืนยันสูตร VAT/ฐานภาษีก่อนเริ่มสร้าง PDF production

## PDF Specification

- ขนาดกระดาษ Letter แนวตั้ง 612 × 792 pt จำนวน 2 หน้า ตามไฟล์ต้นฉบับ
- Typography ใช้ Cordia New ให้สัดส่วนภาพใกล้ต้นฉบับ: เนื้อหา 11 pt, หัวข้อเน้น 12 pt และหัวข้อ “ใบเสนอราคา” 18 pt; เครื่อง Production ต้องติดตั้ง Cordia New โดยมี Tahoma เป็น fallback

### Page 1: Commercial Summary

- โลโก้และข้อมูลบริษัทจาก Company Settings
- เลขที่ใบเสนอราคา วันที่ และวันหมดอายุ
- ข้อมูลโครงการ ลูกค้า ที่อยู่ เบอร์โทร เลขผู้เสียภาษี และอีเมล
- ข้อมูล Sales ผู้จัดทำ
- Package หลักและรายการอุปกรณ์จาก Snapshot
- Add-on/Custom item แสดงเป็นรายการแยก พร้อมจำนวนและราคา
- เงื่อนไขชำระเงิน
- ข้อมูลธนาคารและ QR Code จาก Company Settings
- สรุปราคา ส่วนลด ราคาสัญญา VAT เงินจอง และยอดคงเหลือ
- จำนวนเงินตัวอักษรภาษาไทย

### Page 2: Terms and Signatures

- การรับประกันสินค้า
- หมายเหตุตามประเภท Package
- O&M สำหรับแพ็กเกจติดตั้งใหม่
- เงื่อนไขเพิ่มเติม
- ช่องลายเซ็นลูกค้าและผู้จัดทำ
- ภาพลายเซ็น ชื่อ ตำแหน่ง และวันที่อนุมัติของ Sale Sup/Admin ดึงจาก User Profile และ Approval Event แล้วเก็บเป็น Snapshot
- หากผู้อนุมัติยังไม่มีภาพลายเซ็นใน User Profile ระบบต้องแจ้งให้เพิ่มก่อนอนุมัติ

### PDF States

- `draft`/`pending_approval`: เปิด Preview ได้พร้อมลายน้ำ
- `approved`: สร้าง PDF ตัวจริงไม่มีลายน้ำ
- PDF ที่อนุมัติแล้วต้องผูกกับ Revision และ Snapshot เดิม
- การสร้าง PDF ซ้ำต้องได้ข้อมูลและยอดเงินเดิม ห้ามอ่านราคาล่าสุดจาก Package Master

## API Plan

- `GET /api/leads/:leadId/quotations`
- `POST /api/leads/:leadId/quotations`
- `GET /api/quotations/:id`
- `PATCH /api/quotations/:id`
- `DELETE /api/quotations/:id` เฉพาะ Draft ที่ยังไม่เคยส่งอนุมัติ
- `POST /api/quotations/:id/duplicate`
- `POST /api/quotations/:id/submit`
- `POST /api/quotations/:id/approve`
- `POST /api/quotations/:id/request-changes`
- `POST /api/quotations/:id/send` เฉพาะ Sales เจ้าของ Lead หรือ Admin และ Quotation ต้อง Approved
- `GET /api/quotations/:id/pdf?mode=preview|approved`
- `GET /api/quotation-approvals?status=pending_approval`

ทุก mutation ต้องตรวจ Role, สถานะปัจจุบัน, Revision และ ownership ฝั่ง Server พร้อม transaction สำหรับการเปลี่ยนสถานะ/สร้าง Approval Event

## UI Plan

### Step 03 Quotation

- การ์ดชุด 1, 2, 3 ตาม Mockup
- สถานะ Draft, รออนุมัติ, อนุมัติแล้ว, ส่งกลับแก้ไข
- Quote Builder แบ่งเป็น Package, Package Items, Add-on/Custom Items, Discount, Deposit, Payment Terms, Notes
- ปุ่ม Preview PDF, Duplicate, ส่งขออนุมัติ และส่งลูกค้า
- ปุ่มส่งลูกค้าปิดใช้งานจนกว่าจะ Approved และแสดงเฉพาะ Sales เจ้าของ Lead/Admin
- แสดงเหตุผลที่ Sale Sup ส่งกลับในแต่ละการ์ด

### Sale Sup Approval Queue

- เมนูสำหรับ Role `sales_sup` และ Admin
- Filter ตามสถานะ วันที่ Sales และโครงการ
- แสดงความต่างจาก Package Master โดยเน้น Add-on/Custom item และส่วนลด
- เปิด PDF Preview
- หลังอนุมัติสามารถดูและดาวน์โหลด Approved PDF ได้ แต่ไม่มีสิทธิ์ส่งให้ลูกค้า
- อนุมัติหรือส่งกลับพร้อมหมายเหตุ
- รองรับเลือกหลายรายการเพื่ออนุมัติ แต่ API ประมวลผล/บันทึกแยกทีละ Quotation

### Order Step

- แสดงเฉพาะ Quotation ที่ Approved ให้ลูกค้าเลือก
- เมื่อลูกค้าเลือก ให้บันทึก `quotation_accepted_idx`/quotation reference และคัดลอกยอดเข้าสู่ Order Snapshot
- หากเริ่มรับชำระแล้ว ห้ามเปลี่ยน Quotation ที่เลือกตามกฎเดิม

## Legacy Compatibility

- ใบเสนอราคาเดิมที่อยู่ใน `quotation_files` ต้องยังเปิดดูได้
- สร้าง adapter อ่านข้อมูลเดิมควบคู่กับ `quotations` ระหว่างช่วงเปลี่ยนผ่าน
- ห้ามแปลงไฟล์เดิมเป็น Quotation ใหม่โดยเดาราคา/Package
- Lead ใหม่หลังวันเปิดใช้ Feature ให้ใช้โครงสร้างใหม่
- กำหนดวันที่หยุดเขียน `quotation_files` หลัง UAT ผ่าน

## Implementation Phases

### Phase 0 — Confirm Business Data

- กำหนด sequence และ migration สำหรับเลขเอกสาร `SM-QT-YY-XXXX` โดยป้องกันเลขซ้ำ
- ยืนยันสูตร VAT เงินจอง และยอดงวดกับ Account
- ยืนยัน Company/Bank/QR/Line OA และข้อความ Terms
- ยืนยันข้อมูล Package ที่ขาดจาก Excel
- ตรวจรายการอุปกรณ์และราคา Active ทั้ง 23 Package

### Phase 1 — Foundation and Migration

- อ่านคู่มือ Next.js ที่เกี่ยวข้องใน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด
- เพิ่ม Role `sales_sup`
- เพิ่ม/ตรวจ User Profile fields สำหรับตำแหน่งและภาพลายเซ็นผู้อนุมัติ
- เพิ่มตาราง Quotation, Items, Installments และ Approval Events
- เพิ่ม Package Item Master/Terms Profile ตาม schema ที่เหมาะกับฐานข้อมูลปัจจุบัน
- Seed ข้อมูล Development และเพิ่ม migration แบบ idempotent

### Phase 2 — Quotation Builder

- สร้าง API CRUD และ validation
- สร้าง UI 3 การ์ดและ Quote Builder
- ดึง Package Snapshot และรองรับ Add-on/Custom item
- เพิ่มการคำนวณราคา ส่วนลด VAT เงินจอง และงวดชำระ
- Autosave Draft โดยไม่สร้าง Revision เกินจำเป็น

### Phase 3 — Simple Approval

- สร้าง Submit/Approve/Request Changes API
- สร้าง Sale Sup Approval Queue
- เพิ่ม permission checks ฝั่ง API
- เพิ่ม Activity Log และสถานะบนการ์ด
- รีเซ็ต Approval เมื่อข้อมูลสำคัญเปลี่ยน

### Phase 4 — PDF Generation

- สร้าง PDF Letter แนวตั้ง 2 หน้า (612 × 792 pt) ให้ใกล้เคียงไฟล์ตัวอย่าง
- รองรับ Draft watermark และ Approved PDF
- ผูก PDF กับ Revision/Snapshot
- ตรวจภาษาไทย ฟอนต์ โลโก้ QR ตาราง และ page break

### Phase 5 — Order Integration and Legacy

- ให้ Order เลือกเฉพาะใบที่ Approved
- คัดลอกยอด/เลขเอกสาร/Revision ไป Order Snapshot
- รองรับใบเสนอราคาเดิมแบบ read-only
- ปิดการเขียน flow upload แบบเดิมสำหรับ Lead ใหม่เมื่อผ่าน UAT

### Phase 6 — QA, UAT and Rollout

- Unit test สูตรราคา/ส่วนลด/VAT/เงินจอง/rounding
- API authorization test สำหรับ Sales, Sale Sup, Admin และ Role อื่น
- Integration test สร้าง 3 ฉบับ ส่งอนุมัติ ส่งกลับ แก้ Revision อนุมัติ และเลือกใน Order
- PDF regression test สำหรับ Package ทั้ง 23 รายการ
- UAT กับ Sales, Sale Sup และ Account
- ใช้ Development ก่อน Production และขออนุญาตผู้ใช้ก่อน Deploy ทุกครั้ง

## Acceptance Criteria

- Sales สร้างใบเสนอราคาได้ 1-3 ฉบับต่อ Lead
- Package Item มาจาก Master และไม่ถูกแก้ทับ
- Add-on/Custom item เพิ่มได้และยอดคำนวณถูกต้อง
- ส่วนลด เงินจอง VAT และงวดชำระแยกความหมายชัดเจน
- Sale Sup/Admin เท่านั้นที่อนุมัติหรือส่งกลับได้
- ใบที่ยังไม่อนุมัติส่งลูกค้าไม่ได้
- Approved PDF มีภาพลายเซ็น ชื่อ ตำแหน่ง และวันที่ของผู้อนุมัติครบ
- เฉพาะ Sales เจ้าของ Lead หรือ Admin ส่ง Approved PDF ให้ลูกค้าได้
- การแก้ข้อมูลสำคัญหลังอนุมัติสร้าง Revision และขออนุมัติใหม่
- PDF Approved เป็น Letter แนวตั้ง 2 หน้า (612 × 792 pt) และยอดตรงกับข้อมูลในระบบ
- Order เลือกได้เฉพาะใบที่ Approved และเลือกได้หนึ่งฉบับ
- ใบเสนอราคาเดิมยังเปิดดูได้
- Activity Log ระบุผู้ดำเนินการ วันเวลา สถานะ และเหตุผลครบ

## Test Matrix

- Package มาตรฐาน ไม่มี Add-on ไม่มีส่วนลด
- Package + Add-on Master
- Package + Custom item หลายรายการ
- ส่วนลดจำนวนเงินและเปอร์เซ็นต์
- เงินจองเป็นศูนย์และมีเงินจองที่รับแล้ว
- งวดชำระ 20/80 และกรณีมีเศษสตางค์
- สร้างครบ 3 ฉบับและอนุมัติสถานะต่างกัน
- Sale Sup ส่งกลับพร้อมเหตุผล
- แก้ Approved quotation แล้วสร้าง Revision
- Role ที่ไม่มีสิทธิ์เรียก Approve API
- Package ทั้ง 23 รายการและ Terms Profile ทั้งสองแบบ
- Legacy quotation file

## Finalized Business Rules

1. เลขเอกสารใช้ `SM-QT-YY-XXXX`
2. Sale Sup อนุมัติใบที่ตนสร้างเองได้
3. Payment Terms เลือกจาก Template และแก้ไขรายใบได้
4. Approved PDF ใช้ภาพลายเซ็นผู้อนุมัติจาก User Profile พร้อมชื่อ ตำแหน่ง และวันที่
5. ส่วนลดมีชื่อส่วนลดแบบข้อความ จำนวน/เปอร์เซ็นต์ และเหตุผล
6. Sales เจ้าของ Lead เป็นผู้ส่ง Approved PDF ให้ลูกค้า; Admin ส่งแทนได้ ส่วน Sale Sup ดูและดาวน์โหลดได้
