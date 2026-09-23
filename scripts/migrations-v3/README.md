# Migrations ของ v3

แยกจาก `scripts/migrations/` ด้วยเหตุผล 2 ข้อ

1. **เลขไม่ชนกัน** — v2 ยังเพิ่ม migration ของตัวเองตลอด 3 เดือน ถ้าใช้โฟลเดอร์
   เดียวกันจะแย่งเลขกันทุกครั้งที่ merge main เข้า v3
2. **prod มองไม่เห็น** — `deploy_prd.sh` อ่านเฉพาะ `scripts/migrations/`
   migration ของ v3 จึงไม่มีทางหลุดไปรันบน prod ก่อนวัน cutover

## กติกา

- ตั้งชื่อด้วย timestamp: `20260810-1430_add_xxx.sql` (ไม่ใช้เลขรัน จะได้ไม่ชนกันเองในทีม)
- รันกับ DB ของ v3 เท่านั้น: `node scripts/tools/deploy_migrations.mjs --db=solardb_v3 --yes --dir=scripts/migrations-v3`
  รันซ้ำได้ตลอด — ไฟล์ที่ผ่านแล้วถูกจดไว้ในตาราง `dbo._migrations_applied` และจะถูกข้าม
  (เดิมไล่รันตั้งแต่ไฟล์แรกใหม่ทุกครั้ง แล้วตายที่ไฟล์แรกที่ไม่ idempotent — 18 จาก 50 ไฟล์เป็นแบบนั้น)
- **ฐานที่รัน migration ไปแล้วก่อนมีทะเบียน** (เช่น `solardb_v3` ตัวที่ใช้อยู่ตอนนี้)
  สั่งครั้งเดียวเพื่อจดว่าทุกไฟล์ผ่านแล้วโดยไม่รันซ้ำ:
  `node scripts/tools/deploy_migrations.mjs --db=solardb_v3 --yes --dir=scripts/migrations-v3 --baseline`
  ฐานที่ copy มาจาก prod ใหม่ **ไม่ต้องทำ** — ไม่มีตารางทะเบียน ⇒ รันครบทั้งชุดตามลำดับเอง
- **ห้ามลบคอลัมน์/ตาราง หรือเปลี่ยนชนิดข้อมูล** ในช่วง 3 เดือนแรก — ถ้า cutover แล้วต้อง
  rollback โค้ดกลับ v2 ข้อมูลต้องยังอ่านได้ (โค้ดย้อนได้ใน 5 นาที แต่ DB ย้อนไม่ได้)
- ก่อน cutover ให้ซ้อมใหญ่: copy prod ล่าสุด → `solardb_v3` แล้วรันทั้งชุดรวดเดียว
