# Package Master and Excel Alignment

Status: in-progress

## Objective

ปรับ Package Master และรายการอุปกรณ์ในระบบให้ข้อมูลสอดคล้องกับไฟล์
`ใบเสนอราคาติดตั้ง Solar Cell_ตัวอย่างV0.xlsx` โดยคงราคาเดิมที่ตรวจแล้วว่าตรงกัน
ครบ 22 Package และสามารถ rollback ข้อมูล/โค้ดกลับได้โดยไม่กระทบใบเสนอราคาที่อนุมัติแล้ว

คำว่า "สอดคล้อง" ในแผนนี้หมายถึงข้อมูลแพ็กเกจและข้อความในเอกสารตรงกับ Excel
ไม่ใช่การทำหน้าจอ Package Management ให้มีหน้าตาเหมือนตาราง Excel

## Current Findings

- Excel มี Package ที่มีข้อมูล 22 รายการ และมี `Sheet1` ว่าง 1 ชีต
- ราคา 22 รายการตรงกับ Package Master ใน Development แล้ว
- ระบบมี `Battery 4.8 kWh ZTT` ราคา 41,900 บาทเพิ่มอีก 1 รายการ ซึ่งไม่มีชีตคู่ใน Excel
- ระบบเก็บ `kwp` เป็นขนาดเรียกแพ็กเกจ แต่ Excel บางรายการใช้กำลังติดตั้งจริง เช่น 3.84, 5.12 และ 7.68 kWp
- Package Hybrid ยังไม่มียี่ห้อ/ขนาด/รุ่น Inverter ใน Package Master แม้ Excel ระบุ DEYE และรุ่นไว้
- Package 20 kWp ไม่มี `inverter_kw` ทำให้หน้าแสดง `Huawei nullkW`
- `package_items` ปัจจุบันเป็นข้อความสรุปทั่วไป ไม่ได้ระบุรุ่นและจำนวนอุปกรณ์ครบเหมือน Excel
- ใบเสนอราคาเก็บชื่อ ราคา และรายการอุปกรณ์เป็น snapshot แล้ว จึงไม่ควรแก้ใบที่อนุมัติย้อนหลัง

## Recommended Data Model

คง `packages.kwp` เป็นขนาดเรียก/ขนาดใช้กรอง และเพิ่มคอลัมน์แบบ additive เพื่อไม่ทำลาย
พฤติกรรมเดิม:

- `installed_kwp DECIMAL(6,2) NULL` — กำลังติดตั้งจริงจาก Excel
- `panel_count INT NULL`
- `panel_watt INT NULL`
- `inverter_model NVARCHAR(100) NULL`
- `battery_model NVARCHAR(150) NULL`

ใช้ `panel_brand`, `inverter_brand`, `inverter_kw`, `battery_brand` และ `battery_kwh`
ที่มีอยู่แล้วให้ครบถ้วน และปรับ `package_items` ให้แยกรายการอุปกรณ์จริงจาก Excel โดยเก็บ
ชื่ออุปกรณ์ใน `item_name` และจำนวน/หน่วยใน `quantity`/`unit`

## Scope

1. สร้าง mapping 22 แถวระหว่าง Package ID ในระบบกับชื่อชีต Excel
2. ยืนยันนโยบายของ Package `Battery 4.8 kWh ZTT` ว่าจะเก็บเป็นรายการเฉพาะระบบ
   หรือเพิ่มชีตอ้างอิงใน Excel โดยไม่ลบทันที
3. เพิ่มคอลัมน์ข้อมูลทางเทคนิคแบบ nullable และย้อนหลังได้
4. เติมกำลังติดตั้งจริง จำนวน/วัตต์แผง ยี่ห้อ ขนาด และรุ่น Inverter/Battery
5. แทนรายการ `package_items` แบบ generic ด้วยรายการจาก Excel ครบทุก Package
6. ปรับหน้า Package Management ให้แสดงขนาดเรียกและกำลังติดตั้งจริงแยกกัน
7. ป้องกัน `nullkW` และไม่แสดง badge ที่ข้อมูลไม่สมบูรณ์
8. ให้ Quotation Preview/PDF ใช้รายละเอียดจาก Package Master และ snapshot เหมือนเดิม
9. ไม่เปลี่ยนราคา Package ทั้ง 22 รายการ
10. ไม่แก้ quotation ที่อนุมัติแล้วหรือ snapshot เอกสารย้อนหลัง

## Safe Implementation Sequence

### 1. Prepare and freeze the source

- บันทึก checksum/วันที่แก้ไขของไฟล์ Excel ที่ใช้เป็นต้นฉบับ
- ส่งออก mapping เป็นตารางตรวจสอบ: Package ID, Sheet, ราคา, phase, installed kWp,
  panel, inverter, battery และรายการอุปกรณ์
- ให้ผู้เกี่ยวข้องยืนยัน mapping ก่อนเขียนฐานข้อมูล

### 2. Back up Development

สร้างสำเนาตารางพร้อม timestamp และจดชื่อจริงที่เครื่องมือคืนมา:

```powershell
node scripts/tools/backup_tables.mjs --db=solardb_dev --tables=packages,package_items
```

ตรวจจำนวนแถวและสุ่มเทียบอย่างน้อย Package 3 kWp, Hybrid 7 kWp,
Scale Up และ 20 kWp ก่อนดำเนินการต่อ

### 3. Add schema and data migration

- สร้าง migration หมายเลขถัดไปใน `scripts/migrations/`
- ใช้ transaction และ update ด้วย Package `id` ที่ระบุชัดเจน
- เพิ่มคอลัมน์แบบ nullable ก่อน เพื่อให้โค้ดเดิมยังทำงานได้
- อัปเดต master fields โดยไม่เปลี่ยนราคา
- สำหรับ `package_items` ให้ soft-deactivate รายการเดิมและ insert รายการใหม่
- บันทึก ID รายการใหม่ที่ migration สร้างไว้สำหรับ rollback; ไม่พึ่งเวลาอย่างเดียว
- migration ต้อง idempotent หรือหยุดเมื่อพบสภาพข้อมูลที่ไม่ตรงกับ precondition

### 4. Update application

- ขยาย Package API และแบบฟอร์มแก้ไขให้รองรับ fields ใหม่
- แสดง `installed_kwp` เป็น "กำลังติดตั้งจริง" โดยยังใช้ `kwp` เป็นชื่อ/ตัวกรอง
- แสดงยี่ห้อและรุ่น Inverter/Battery เฉพาะเมื่อมีค่า
- ปรับ Quotation item rendering ให้จำนวนและหน่วยไม่ซ้ำกับข้อความ `item_name`
- คง snapshot ของ quotation เดิมไว้; ใช้ master ใหม่เฉพาะ quotation ใหม่หรือ draft
  ที่ผู้ใช้เลือก/บันทึก Package ใหม่

### 5. Verify Development

- ตรวจราคา 22/22 รายการว่าคงเดิม
- ตรวจชื่อ/phase/installed kWp/panel/inverter/battery เทียบ Excel ทุกชีต
- ตรวจ Package Management ทุกกลุ่มและยืนยันว่าไม่มี `nullkW`
- สร้าง quotation ทดสอบอย่างน้อย 4 แบบ: On-Grid, Hybrid, Scale Up battery,
  Scale Up panel
- ตรวจ Preview และ PDF ว่ารายการอุปกรณ์ จำนวน หน่วย งวด 20/80 และเงื่อนไขตรง
- เปิด quotation ที่อนุมัติก่อน migration และยืนยันว่า snapshot/PDF ไม่เปลี่ยน
- รัน TypeScript, ESLint, quotation regression tests และ production build
- ทำ Business UAT ใน Development ก่อนขออนุมัติ Production

### 6. Production rollout

- เลือก maintenance window สั้น ๆ และหยุดการแก้ Package ชั่วคราว
- สำรอง `packages` และ `package_items` ใน Production ด้วยเครื่องมือเดียวกัน
- บันทึกชื่อ backup table และจำนวนแถวใน deployment log
- apply migration ไปที่ `solardb` หลังได้รับอนุมัติเท่านั้น
- deploy โค้ดที่รองรับทั้งค่าที่มีและไม่มี fields ใหม่
- ทำ smoke test และตรวจ quotation เก่ากับ quotation ใหม่

## Rollback Procedure

### Fast rollback: application only

ใช้เมื่อหน้า UI/PDF ใหม่มีปัญหา แต่ข้อมูลฐานข้อมูลถูกต้อง:

1. deploy git commit ก่อนการเปลี่ยนแปลงกลับมา
2. ไม่ต้องลบคอลัมน์ใหม่ เพราะเป็น nullable และโค้ดเก่าไม่อ่าน
3. ตรวจ Package API, Quotation Preview และ PDF

### Data rollback

ใช้ชื่อ backup table จริงจากขั้นตอนสำรอง และทำภายใต้ transaction:

1. หยุดการแก้ Package ชั่วคราว
2. สำรองสถานะหลังเปลี่ยนอีกชุดก่อน rollback เพื่อรักษาหลักฐาน
3. `UPDATE packages` จาก `packages_bak_<timestamp>` โดยจับคู่ด้วย `id`
4. `UPDATE package_items` เดิมจาก `package_items_bak_<timestamp>` โดยจับคู่ด้วย `id`
   เพื่อคืน `item_name`, `quantity`, `unit`, `sort_order` และ `is_active`
5. เปลี่ยนรายการใหม่ที่ migration สร้างให้ `is_active = 0` ตาม ID ที่บันทึกไว้
6. ไม่ลบ `package_items` ใหม่ทันที เพราะ quotation อาจอ้าง `package_item_id`
7. commit เมื่อจำนวนแถว ราคา และรายการ active ตรงกับ backup เท่านั้น; หากไม่ตรงให้ rollback transaction
8. ทดสอบ Package API และเอกสารใหม่/เก่าอีกครั้ง

### Schema rollback

ไม่จำเป็นสำหรับเหตุฉุกเฉิน ให้คืนโค้ดและข้อมูลก่อน คอลัมน์ใหม่สามารถคงไว้โดยไม่กระทบระบบ
หากต้องการลบจริง ให้ทำ migration แยกหลังยืนยันว่าไม่มีโค้ด รายงาน หรือ view ใช้งานคอลัมน์เหล่านั้นแล้ว

## Rollback Verification

- ราคาและสถานะ active ตรงกับ backup ทุก Package
- จำนวน active `package_items` ต่อ Package ตรงกับ backup
- Package 20 kWp กลับสู่ค่าก่อนเปลี่ยนตาม backup
- quotation ที่อนุมัติแล้วมีชื่อ ราคา รายการ และ PDF hash/ผลแสดงเหมือนก่อนดำเนินการ
- ไม่มี orphan reference จาก `quotation_items.package_item_id`
- Package API, Quotation Preview และ PDF เปิดได้ปกติ

## Acceptance Criteria

- Package ทั้ง 22 รายการมีข้อมูลทางเทคนิคและรายการอุปกรณ์ตรงกับ Excel ที่อนุมัติ
- ราคาไม่เปลี่ยนจากค่าปัจจุบัน
- ไม่มี `null`, ข้อความว่าง หรือจำนวน/หน่วยซ้ำในหน้าและเอกสาร
- ใบเสนอราคาที่อนุมัติแล้วไม่เปลี่ยนย้อนหลัง
- มี backup table, deployment log, forward migration และ rollback SQL ที่ผ่านการทดลองใน Development
- Production เปลี่ยนเฉพาะหลัง Business UAT และผู้ใช้อนุมัติ

## Development Execution Record (2026-08-04)

- Backup ก่อนแก้:
  - `packages_bak_20260804_112819` — 23 rows
  - `package_items_bak_20260804_112819` — 183 rows
- Apply migration 135 กับ `solardb_dev` สำเร็จ
- Active Package เหลือ 22 รายการ และ Package ID 26 (`Battery 4.8 kWh ZTT`) เป็น inactive
- Active Excel package items มี 212 แถว และเทียบข้อความตรงกับ Excel ครบ 22/22 Package
- แก้ตัวนำเข้าให้เก็บรายการลำดับถัดไปที่ไม่ได้ขึ้นต้นด้วย `-` ด้วย โดยเพิ่มแถว `PV MODULE ... จำนวน 2/3 แผง`
  ให้ครบทั้ง 9 Package กลุ่ม Scale Up และให้ PDF แสดงแถวนี้เป็นลำดับ `2` ตาม Excel
- แยกจำนวน/หน่วยท้ายข้อความ Excel ลง `quantity`/`unit` เช่น
  `- CONTROLLER BOX ( AC/DC BOX )` + `1` + `SET`; เมื่อนำไปแสดงใน PDF
  สามารถประกอบกลับเป็นข้อความ Excel เดิมได้ตรงครบ 22/22 Package
- แยกเฟสจากรายการหลักด้วย เช่น `...3.84 kWp` + `1` + `เฟส` และ
  `...10 kWp` + `3` + `เฟส` ทำให้ช่องหน่วยไม่ว่างใน Package ที่ระบุ phase
- Draft IDs 24, 27 และ 28 refresh อัตโนมัติจาก 8 เป็น 11 package items
- Approved quotation ตัวอย่างยังคง package snapshot เดิม 8 รายการ
- ทดสอบ rollback จริงสำเร็จ: กลับเป็น 23 active Package, 183 active items และ Draft 8 items
- Apply migration 135 กลับเข้า Development หลัง rollback test สำเร็จ
- Quotation PDF จริงของ Draft ID 24 ตอบ 200 และแสดงรายการจาก Excel/งวด 20/80 ครบ
- TypeScript, targeted ESLint, quotation terms regression และ Production Build ผ่าน
- ยังไม่ deploy Production; รอ Business UAT และอนุมัติ

## Confirmed Decisions

- ปรับรายการ Package ให้เหมือน Excel: ปิดใช้งาน `Battery 4.8 kWh ZTT` ราคา 41,900 บาท
  ซึ่งไม่มีใน Excel โดยไม่ลบ record ทิ้ง
- คัดข้อความรายการอุปกรณ์จาก Excel โดยตรง ไม่เรียบเรียงใหม่
- quotation สถานะ `draft` เดิมต้องอัปเดต Package snapshot และรายการ Package
  จาก Package Master ใหม่อัตโนมัติ โดยรักษารายการ custom/add-on ไว้
- quotation สถานะอื่น โดยเฉพาะใบที่ส่งอนุมัติหรืออนุมัติแล้ว ต้องคง snapshot เดิม
