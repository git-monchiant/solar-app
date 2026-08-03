# Quotation Terms and Payment Alignment

Status: done

## Objective

ให้ใบเสนอราคาในระบบใช้ Package ราคา และรายการอุปกรณ์จาก Package Master ตามเดิม แต่เลือกข้อความรับประกัน หมายเหตุ การดำเนินงาน/O&M เงื่อนไขเพิ่มเติม และงวดชำระให้ตรงกับไฟล์ Excel ตัวอย่าง

## Scope

- แยกข้อความท้ายใบเสนอราคาเป็น 2 ชุดตามประเภท Package
  - ติดตั้งใหม่: รับประกัน, หมายเหตุ, O&M 2 ปี, เงื่อนไขเพิ่มเติม
  - ติดตั้งเพิ่ม: รับประกัน, เงื่อนไขรับประกันงานติดตั้งเพิ่ม, เงื่อนไขเพิ่มเติม และไม่มี O&M
- ใช้ `is_upgrade` เป็นหลัก และรองรับ Package แบตเตอรี่อย่างเดียวที่ไม่มีแผง/Inverter เป็นงานติดตั้งเพิ่ม
- ทำให้ข้อมูลประเภท Package อยู่ใน quotation document snapshot เพื่อให้ Preview และ PDF จริงใช้กติกาเดียวกัน
- กำหนดงวดมาตรฐานตาม Excel
  - 20% ภายใน 7 วันนับจากวันที่ในใบเสนอราคา
  - 80% ภายใน 3 วันก่อนวันติดตั้ง
- อัปเดต Payment Template ใน Development โดยไม่แก้ใบเสนอราคาที่อนุมัติแล้ว
- เพิ่มการทดสอบสำหรับการเลือกชุดข้อความและงวดชำระ

## Out of Scope

- ไม่เปลี่ยนชื่อ Package ราคา หรือรายการอุปกรณ์ใน Package Master
- ไม่ Deploy ทุก Environment โดยอัตโนมัติ
- ไม่แก้เอกสารใบเสนอราคาที่อนุมัติแล้วย้อนหลัง

## Verification

- TypeScript และ ESLint ผ่าน
- `npm run test:quotation-terms` ผ่าน
- Production Build ผ่านด้วย Next.js 16.2.3
- ตรวจตัวจำแนก Package ติดตั้งใหม่, Hybrid, Scale Up และแบตเตอรี่อย่างเดียวแล้ว
- ตรวจ PDF จริงของ Scale Up แล้ว: งวด 20/80 ตรง Excel, ไม่มีหมวด O&M, เงื่อนไขเพิ่มเติมเป็นหมวด 3 และข้อความเพิ่มเป็นข้อ 3.4
- Apply `sql/132_quotation_terms_payment_alignment.sql` กับ `solardb_dev` แล้ว โดยอัปเดต Default Template และใบ Draft/ส่งกลับแก้ไข 4 ใบ
