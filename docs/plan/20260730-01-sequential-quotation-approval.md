# Sequential Quotation Approval

## Goal

เปลี่ยนการอนุมัติใบเสนอราคาเป็นลำดับ Sale → Solar Sup → Sale Sup โดยทุกขั้นสามารถส่งกลับให้ Sale แก้ไขพร้อมเหตุผล และ Sale เห็นชัดเจนว่ากำลังรอผู้อนุมัติขั้นใด

## Scope

- เพิ่ม role `solar_sup` ในระบบสิทธิ์ ผู้ใช้ และตัวเลือก role
- เพิ่มสถานะ `pending_solar_sup` และ `pending_sales_sup`
- ให้การส่งขออนุมัติจาก Sale เริ่มที่ Solar Sup เสมอ
- ให้ Solar Sup อนุมัติแล้วส่งต่อ Sale Sup โดยอัตโนมัติ
- ให้ Solar Sup และ Sale Sup ส่งกลับ Sale พร้อมเหตุผลได้
- เมื่อ Sale แก้ไขและส่งใหม่ ให้เริ่มตรวจจาก Solar Sup อีกครั้ง
- แสดงสถานะผู้อนุมัติที่กำลังรอและเหตุผลส่งกลับในหน้า Quotation
- แยกคิวอนุมัติตาม active role โดยใช้หน้ารวมและการจัดกลุ่มตาม Lead เดิม
- รักษา approval event audit trail และ document snapshot ต่อรอบส่ง

## Compatibility

- รองรับสถานะเดิม `pending_approval` โดยถือเป็นคิว Sale Sup ระหว่างช่วงเปลี่ยนผ่าน
- Admin สามารถดำเนินการแทนผู้อนุมัติของขั้นปัจจุบันได้ แต่ไม่ข้ามลำดับขั้น
- อนุมัติและส่งกลับแยกตามใบเสนอราคา แม้จะแสดงรวมตาม Lead

## Verification

- ตรวจ TypeScript และ ESLint
- ทดสอบ state transition และ role gate ของ API
- ตรวจ UI สำหรับ Sale, Solar Sup, Sale Sup และ Admin
- ตรวจว่าการส่งกลับและส่งใหม่เริ่ม Solar Sup อีกครั้ง

## Result

- เพิ่ม role และ approval state ครบตามลำดับ Sale → Solar Sup → Sale Sup
- เพิ่มการแสดงผู้ที่กำลังรออนุมัติและรายละเอียดการส่งกลับในหน้า Sale
- เพิ่มคิวตาม active role และคงการจัดกลุ่มใบเสนอราคาตาม Lead
- ใช้ migration `scripts/_archive/migrations/129_sequential_quotation_approval.sql` กับ `solardb_dev` แล้ว
- ย้ายรายการเดิม `pending_approval` จำนวน 4 ฉบับไป `pending_sales_sup`
- ตรวจ schema และ transition ภายใน transaction ที่ rollback ผ่าน
- TypeScript, targeted ESLint และ Next.js production build ผ่าน
- ยังไม่มี user ที่ได้รับ role `solar_sup`; Admin ต้องกำหนดผู้รับผิดชอบก่อนเริ่มใช้งานจริง
