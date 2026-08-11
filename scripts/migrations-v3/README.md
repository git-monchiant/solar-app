# Migrations ของ v3

แยกจาก `scripts/migrations/` ด้วยเหตุผล 2 ข้อ

1. **เลขไม่ชนกัน** — v2 ยังเพิ่ม migration ของตัวเองตลอด 3 เดือน ถ้าใช้โฟลเดอร์
   เดียวกันจะแย่งเลขกันทุกครั้งที่ merge main เข้า v3
2. **prod มองไม่เห็น** — `deploy_prd.sh` อ่านเฉพาะ `scripts/migrations/`
   migration ของ v3 จึงไม่มีทางหลุดไปรันบน prod ก่อนวัน cutover

## กติกา

- ตั้งชื่อด้วย timestamp: `20260810-1430_add_xxx.sql` (ไม่ใช้เลขรัน จะได้ไม่ชนกันเองในทีม)
- รันกับ DB ของ v3 เท่านั้น: `node scripts/tools/deploy_migrations.mjs --db=solardb_v3 --yes --dir=scripts/migrations-v3`
- **ห้ามลบคอลัมน์/ตาราง หรือเปลี่ยนชนิดข้อมูล** ในช่วง 3 เดือนแรก — ถ้า cutover แล้วต้อง
  rollback โค้ดกลับ v2 ข้อมูลต้องยังอ่านได้ (โค้ดย้อนได้ใน 5 นาที แต่ DB ย้อนไม่ได้)
- ก่อน cutover ให้ซ้อมใหญ่: copy prod ล่าสุด → `solardb_v3` แล้วรันทั้งชุดรวดเดียว
