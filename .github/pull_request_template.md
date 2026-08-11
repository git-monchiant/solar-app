## แก้อะไร


## ทดสอบยังไง
<!-- ทดสอบกับ DB ตัวไหน (solardb_dev / solardb_v3) และเคสอะไรบ้าง -->


## มี migration ไหม
- [ ] ไม่มี
- [ ] มี → ไฟล์: `scripts/migrations/…` หรือ `scripts/migrations-v3/…`
      (เขียนไฟล์มาได้ แต่ **ไม่ต้องรันบน prod** เจ้าของระบบจะรันตอน deploy)

## เช็คก่อนส่ง
- [ ] `npx tsc --noEmit` ผ่าน
- [ ] `npm run build` ผ่าน
- [ ] แตก branch จาก `main` (งาน v2) หรือ `v3` (งาน v3) และ base ของ PR ถูกต้อง
- [ ] 1 branch = 1 เรื่อง
