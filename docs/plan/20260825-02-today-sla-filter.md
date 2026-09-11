# รวม SLA เข้า Today ด้วยตัวกรอง

## เป้าหมาย

- รวมคิว SLA เข้ากับ Lead Card เดิมบนหน้า Today โดยไม่เพิ่มแท็บ SLA
- ยกเลิกเมนู SLA และให้ลิงก์เดิม `/sla` ส่งต่อมายัง Today
- รักษาขอบเขตข้อมูลตาม Active Role และความสามารถมอบหมายงาน Solar
- ไม่แก้ฐานข้อมูล ไม่ push และไม่ deploy

## Backup

- จุดย้อนกลับ Git: `backup/sla-before-today-20260825` ที่ `1c69c1e8e6392cfb1ad82c1d11354dd11191009e`
- Source archive: `C:\Project\_backups\Solar-V0\20260825-today-sla-filter-preimplementation.zip`
- SHA-256: `8EABFBAE37E9E35C6D86A2EB448D8972790805E7EE57B5727DA56A8FED268C5C`
- ไม่ต้องสำรอง DB เพิ่ม เพราะขอบเขตนี้ไม่มี migration หรือการแก้ข้อมูล

## งานที่ดำเนินการ

1. เพิ่ม Dropdown ตัวกรอง SLA บนหน้า Today โดยไม่เพิ่มแท็บ
2. โหลด `/api/sla/dashboard` เฉพาะเมื่อเลือกตัวกรอง SLA และ refresh ทุก 60 วินาทีเฉพาะขณะใช้งาน
3. รวมหลาย SLA ของ Lead เดียวเป็น Lead Card ใบเดียว เรียงตามความเร่งด่วน
4. แสดง SLA เร่งด่วนที่สุดบนการ์ด และขยายดูรายการทั้งหมดได้
5. รักษาการมอบหมาย/รับงาน Solar และขอบเขตสิทธิ์จากหน้า SLA เดิม
6. รองรับ `/today?sla=all|breached|near_due|active|without`
7. นำเมนู SLA ออกและ redirect `/sla` ไป `/today?sla=all`
8. ตรวจ type, lint, SLA tests, build, API และหน้าจอ desktop/mobile

## Rollback

- ก่อน push สามารถกลับไปที่ backup branch หรือแตกไฟล์ source archive ได้ทันที
- การ rollback ไม่มีขั้นตอนฐานข้อมูล เพราะงานนี้ไม่เปลี่ยน schema หรือข้อมูล

## ผลการดำเนินการ

- เพิ่ม Dropdown `ทุกงาน / มี SLA / SLA เกินกำหนด / SLA ใกล้กำหนด / SLA กำลังดำเนินการ / ไม่มี SLA` ใน Today โดยไม่เพิ่มแท็บ
- รวมหลาย SLA ต่อ Lead ไว้ใน Lead Card เดียว พร้อมขยายรายการและมอบหมาย/รับงาน Solar
- โหลด SLA แบบ lazy และ refresh ทุก 60 วินาทีเฉพาะเมื่อใช้ตัวกรอง
- นำเมนู SLA ออกและ redirect `/sla` ไป `/today?sla=all`
- ปรับเวอร์ชันเป็น `2.0.25`
- SLA tests, TypeScript, targeted ESLint, production build 96 routes และ `git diff --check` ผ่าน
- API บน `solardb_dev`: Admin 76 งาน, Sales Manager 60 งาน Sales, Solar Manager 16 งาน Solar, Accounting 403 และ SLA Lead join missing 0
- Browser control ไม่มี browser เชื่อมต่อในรอบตรวจ จึงต้องให้ผู้ใช้ยืนยันภาพ desktop/mobile ก่อน push; ไม่มีผลต่อผล type/build/API
- ไม่แก้ migration/ข้อมูลโดยตรง, ไม่ push และไม่ deploy
