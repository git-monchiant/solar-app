# Close Lead At Warranty Issued

Status: done

## Goal

กำหนดให้ CLOSE_LEAD SLA เริ่มหลังติดตั้งเสร็จและเสร็จทันทีเมื่อออกใบรับประกัน โดยเวลา “ปิด Lead” ต้องตรงกับเวลาออกใบรับประกัน และคง SLA 3 วัน

## Business Rule

- เริ่ม SLA: เวลาติดตั้งเสร็จที่ระบบใช้อ้างอิง
- กำหนด SLA: 3 วัน
- เสร็จ SLA / ปิด Lead: เวลาออกใบรับประกัน
- Timeline เมื่อออกใบแล้ว: ออกใบรับประกันก่อน แล้วแสดงผลปิด Lead ที่เวลาเดียวกัน
- ขั้น Grid-Tie ยังดำเนินต่อได้ตาม workflow เดิม; การปิดในที่นี้คือผลของ CLOSE_LEAD SLA

## Scope

- ปรับ runtime SLA และ completion activity
- ปรับการ sort Timeline สำหรับ CLOSE_LEAD ที่เสร็จแล้ว
- เพิ่ม policy version และ migration แก้ข้อมูลเดิมบน `solardb_dev`
- เพิ่ม regression tests และตรวจ production build

## Safety

- สำรองตาราง SLA ก่อน migration
- ทดสอบ migration ภายใน transaction และ rollback ก่อน apply
- ไม่ deploy Production และไม่สร้าง Git commit โดยไม่ได้รับอนุญาต

## Verification

- เคสตัวอย่างมี `completed_at` ตรงกับ `warranty_issued_at`
- SLA เริ่มจากติดตั้งเสร็จและ due เท่ากับ 3 วันถัดไป
- งานที่ยังไม่ออกใบรับประกันคงเป็น SLA เปิด ไม่ถูกยกเลิก
- Test, TypeScript, ESLint และ Next production build ผ่าน

## Result

- CLOSE_LEAD เริ่มจากเวลาติดตั้งเสร็จและกำหนด 3 วัน
- เวลาออกใบรับประกันเป็น `completed_at` ของ CLOSE_LEAD และเป็นเวลาปิด Lead ที่แสดง
- Timeline ใช้เวลา completion สำหรับเรียง CLOSE_LEAD ที่เสร็จแล้ว จึงแสดงออกใบรับประกันก่อนผลปิด Lead เมื่อ timestamp ตรงกัน
- งานที่ยังไม่ออกใบรับประกันกลับมาเป็น SLA เปิดเพื่อรอใบรับประกัน
- Policy CLOSE_LEAD v4 และ migration 169 ผ่าน dry-run/rollback สองรอบก่อน apply บน `solardb_dev`
- Lead 691 เริ่ม 10 ก.ค. 2569 23:59:59, กำหนด 13 ก.ค. 2569 23:59:59 และเสร็จตรงเวลาออกใบ 11 ก.ค. 2569 13:28:36 จึงเสร็จใน SLA
- หลัง migration มี 6 แถวที่มองเห็น: ออกใบแล้ว 3 แถวเสร็จตรง warranty timestamp และอีก 3 แถวเปิดรอออกใบ; ทุกแถวเป็น SLA 3 วัน
- สำรองข้อมูลไว้ที่ `sla_policies_bak_20260821_121850`, `lead_sla_instances_bak_20260821_121850`, `lead_sla_events_bak_20260821_121850`
- SLA tests, TypeScript, targeted ESLint และ Next production build 96 routes ผ่าน
- ยังไม่ deploy Production และยังไม่สร้าง Git commit
