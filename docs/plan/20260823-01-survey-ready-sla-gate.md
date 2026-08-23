# Gate SLA นัด Pre-Survey ด้วยการยืนยันชำระเงิน

วันที่: 2026-08-23  
สถานะ: done

## เป้าหมาย

แยก Sales Grade ออกจากจุดเริ่ม SLA นัดสำรวจ และใช้การยืนยันชำระค่าจองเป็นหลักฐานที่ชัดเจน ตรวจสอบย้อนหลังได้ และไม่ต้องเพิ่มปุ่มยืนยันความพร้อมให้ผู้ใช้

## กติกา

- การกำหนด Grade ปิด SLA ประเมิน Grade ตามเดิม แต่ไม่เปิด `BOOK_SURVEY`
- การชำระปกติเปิด `BOOK_SURVEY` 24 ชั่วโมงเมื่อ Account ยืนยันรับเงินจริง
- ฟรีค่าจองเปิด `BOOK_SURVEY` เมื่อ Sales เลือกฟรีแล้วกด `ถัดไป`
- การมีนัด Pre-Survey เป็น fallback สำหรับข้อมูลเดิมและ direct-booking flow
- Grade F ยังคงเข้าสู่ Lost flow และยกเลิก SLA ที่เปิดอยู่
- ไม่มีคำถาม `พร้อมแล้ว / ยังไม่พร้อม` และไม่มีปุ่มกรณียกเว้นในหน้า Lead

## การตัดสินใจล่าสุด

- ยกเลิกการถาม `พร้อมแล้ว / ยังไม่พร้อม` และไม่แสดงปุ่มกรณียกเว้น
- การชำระปกติเริ่ม `BOOK_SURVEY` อัตโนมัติเมื่อ Account ยืนยันรับเงินจริง
- ฟรีค่าจองเริ่ม `BOOK_SURVEY` เมื่อ Sales เลือกฟรีแล้วกด `ถัดไป` และเปิดหน้านัดสำรวจทันที

## งานที่ต้องทำ

1. เก็บ timestamp ภายในสำหรับ anchor และ migration ข้อมูลเดิม
2. เปลี่ยน anchor ของ `BOOK_SURVEY` จาก Grade เป็น Payment confirmation
3. ให้ API ชำระเงินทั้งโอน เช็ค และฟรีค่าจองเปิด SLA อัตโนมัติ
4. นำ UI Survey Ready และขั้นตอนยืนยันซ้ำออกจากหน้า Lead
5. ปรับ Timeline/Dashboard ให้แสดง milestone อย่างถูกต้อง
6. เพิ่ม regression tests และตรวจ TypeScript, ESLint, production build

## การย้ายข้อมูลเดิม

- Lead ที่ยืนยันชำระแล้วจะ backfill anchor จาก `payments.confirmed_at`; ฟรีค่าจองเดิมใช้หลักฐาน booking/anchor เดิม
- `BOOK_SURVEY` ที่ยังเปิดแต่ยังไม่ยืนยันชำระจะถูกยกเลิกและล้าง breach verdict ของกติกาเดิม
- ประวัติ Grade และ SLA ที่เสร็จแล้วจะไม่ถูกลบ

## ผลลัพธ์

- ใช้ policy `BOOK_SURVEY` v5 โดย anchor คือ `payment_confirmed`
- การชำระปกติเริ่ม SLA ใน transaction ที่ Account ยืนยันเงิน; เช็คเริ่มเมื่อ Account ยืนยันว่าเงินเข้าแล้ว
- เลือกฟรีค่าจองแล้วกด `ถัดไป` จะตั้ง payment confirmation ยอด 0 เริ่ม SLA และเปิดหน้านัดทันที โดยไม่บังคับสลิปหรือหมายเหตุ
- นำกล่อง, chip, modal และปุ่มกรณียกเว้นของ Survey Ready ออกจากหน้า Pre-Survey ทั้งหมด
- Admin ถอยการยืนยันชำระเงินจะยกเลิก anchor และ reconcile SLA อัตโนมัติ
- migration 174 สำรองข้อมูลแล้วและ apply บน `solardb_dev` สำเร็จแบบ idempotent: backfill 92 Lead, ยกเลิก BOOK_SURVEY จากกติกา Grade เดิม 168 รายการ, ไม่เหลืองานเปิดที่ไม่มี Survey Ready, completed history 71 รายการอยู่ครบ
- migration 175 apply บน `solardb_dev` ซ้ำได้แบบ idempotent หลังสำรองตาราง suffix `20260823_131254`: policy v5 active 1, open unpaid 0, paid missing anchor 0, open paid wrong version 0 และ completed history 71 รายการอยู่ครบ
- `npm run test:sla`, TypeScript, targeted ESLint และ Next production build 97 routes ผ่าน; ESLint ไม่มี error และเหลือ warning `<img>` เดิม 2 จุดใน PaymentSection
- ยังไม่ deploy Production
