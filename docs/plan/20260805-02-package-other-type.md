# Package Other Type

Status: `done`

## Objective

เพิ่มประเภท Package `อื่นๆ` ให้เลือกและบันทึกได้จริงจากหน้า Package Management

## Scope

- เพิ่มคอลัมน์ `packages.is_other`
- รองรับ `is_other` ใน Package create/update API
- เพิ่มปุ่ม `อื่นๆ` ในส่วนประเภทของฟอร์ม
- แยก Package ประเภทอื่นๆ เป็นกลุ่มเฉพาะในรายการ
- เพิ่มตัวกรองประเภทอื่นๆ
- แสดง badge `อื่นๆ` บน Package card

## Verification

- Migration รันซ้ำได้และค่า Package เดิมเป็น `false`
- สร้าง/แก้ Package ประเภทอื่นๆ ผ่าน API ได้
- Lint, TypeScript/build และ UI data flow ผ่าน

## Deployment

Apply schema เฉพาะ `SolarDb_DEV` ไม่มีการ Deploy environment อื่น

## Result

- เพิ่มและ apply migration `139_package_other_type.sql` ที่ `SolarDb_DEV`
- Package เดิมทั้ง 23 รายการมี `is_other = false`
- เพิ่มปุ่ม, filter, badge และกลุ่ม `อื่นๆ` ใน Package Management
- Package ประเภทอื่นๆ แสดงอัตโนมัติในกลุ่ม `Package อื่นๆ` ของ Quotation Builder ทั้ง Package หลักและรายการเพิ่มเติม
- POST/PATCH/GET integration test ของ Package อื่นๆ ผ่าน
- ลบ Package ทดสอบชั่วคราวหมดแล้ว
- Targeted lint, production build และ diff check ผ่าน
