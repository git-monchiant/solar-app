# แสดงการเข้าสู่สถานะล่าสุดใน Timeline

วันที่: 2026-08-23  
สถานะ: done

## เป้าหมาย

ให้ Timeline กลางเป็นภาพสรุปของ workflow ที่มีผลล่าสุด เมื่อ Lead ถูก rollback แล้วเข้าสู่สถานะเดิมซ้ำ ให้แสดงเฉพาะการเข้าสู่สถานะครั้งล่าสุด โดยเก็บประวัติทั้งหมดไว้ใน Activity Log

## ขอบเขต

1. คัด `status_change` แบบเดินหน้าให้เหลือรายการล่าสุดต่อสถานะปลายทาง
2. ไม่ลบ rollback และกิจกรรมประเภทอื่นจากข้อมูล audit
3. ใช้กติกาเดียวกันกับทุก stage
4. เพิ่ม regression test สำหรับกรณี Order → rollback Quotation → Order

## เกณฑ์สำเร็จ

- Lead 882 แสดง “เข้าสู่ขั้น Order” วันที่ 4 ส.ค. เพียงรายการเดียวใน Timeline กลาง
- รายการวันที่ 3 ส.ค. ยังคงอยู่ใน Activity Log
- transition ไปสถานะอื่นและ rollback ไม่ถูกลบผิดรายการ
- test, TypeScript, ESLint และ build ผ่าน

## ผลลัพธ์

- Timeline กลางคัดการเดินหน้า `status_change` ให้เหลือรายการล่าสุดต่อสถานะปลายทาง ใช้ร่วมกันทุก stage
- เคส Order → rollback Quotation → Order เหลือการเข้า Order รอบล่าสุดใน Timeline ส่วนรอบแรกและ rollback ยังตรวจสอบได้ครบใน Activity Log
- เพิ่ม pure helper และ regression test ป้องกันการกลับมาแสดงสถานะซ้ำ
- `npm run test:sla`, TypeScript, targeted ESLint และ Next production build 97 routes ผ่าน; ESLint เหลือ warning เดิม 3 จุดในหน้า Lead
- ยังไม่ deploy Production
