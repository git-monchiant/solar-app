# Dashboard III Popup and Excel

## Goal

ปรับ popup รายชื่อ Lead ของ Dashboard III ให้ใช้รูปแบบเดียวกับ Dashboard I และเพิ่มปุ่ม Excel สำหรับดาวน์โหลดเฉพาะรายการที่แสดงใน popup ปัจจุบัน

## Scope

- ปรับ header, list row, status badge, close button และ footer ของ popup ให้ยึด Dashboard I เป็น base model
- คงข้อมูลคำตอบเฉพาะมิติของ Dashboard III ไว้ในแต่ละแถว
- เพิ่ม Excel export โดยมี ID, ชื่อ, บ้านเลขที่, โครงการ, Source, สถานะ, คำตอบ และวันที่สร้าง
- ไม่แก้ Dashboard II ในรอบนี้

## Verification

- Popup รองรับ loading, error, empty และ populated states
- ปุ่ม Excel แสดงเมื่อมีข้อมูล และไฟล์มีจำนวนแถวตรงกับ popup
- ESLint, TypeScript และ diff check ผ่าน
