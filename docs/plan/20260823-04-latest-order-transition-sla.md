# ให้ SLA อ้างการเข้า Order รอบล่าสุด

วันที่: 2026-08-23
สถานะ: done

## เป้าหมาย

ทำให้เวลาเสร็จของ `PROPOSAL_ROI` และเวลาเริ่มของ `DEPOSIT_CLOSE` ตรงกับการเข้าสู่ Order รอบล่าสุดหลัง rollback เช่นเดียวกับเหตุการณ์ที่ Timeline กลางแสดง

## ขอบเขต

1. Runtime เลือก forward transition เข้า Order ล่าสุด และไม่ใช้ rollback เป็น milestone
2. `PROPOSAL_ROI` ที่ปิดแล้วอัปเดต completion เมื่อมีการเข้า Order รอบใหม่
3. `DEPOSIT_CLOSE` ที่ปิดแล้วอัปเดต anchor/deadline ตามการเข้า Order รอบใหม่
4. เพิ่ม migration แบบ idempotent พร้อม audit และ apply เฉพาะ `solardb_dev`
5. ตรวจ Lead 882, invariant, test, TypeScript, ESLint และ build

## เกณฑ์สำเร็จ

- Lead 882: Proposal เสร็จ 4 ส.ค. 15:53 และ SLA ปิดการขายเริ่ม 4 ส.ค. 15:53
- ไม่มี SLA สองรายการนี้อ้างการเข้า Order รอบเก่าเมื่อมีรอบล่าสุด
- migration รันซ้ำแล้วไม่เพิ่ม correction event
- ยังไม่แตะ Production

## ผลลัพธ์

- Runtime เลือก forward `status_change → order` ล่าสุด โดยไม่ใช้ rollback และใช้ quotation activity เป็น fallback เฉพาะข้อมูลเก่าที่ไม่มี transition
- `PROPOSAL_ROI` v5 สามารถอัปเดต completion ของ instance ที่ปิดแล้วเมื่อเข้า Order รอบใหม่
- `DEPOSIT_CLOSE` v4 สามารถอัปเดต anchor/deadline ของ instance ที่ปิดแล้วให้ตรงกับ Order รอบล่าสุด
- สำรอง `solardb_dev` เป็น `sla_policies_bak_20260823_150954`, `lead_sla_instances_bak_20260823_150954`, `lead_sla_events_bak_20260823_150954`
- apply migration 178 และรันซ้ำบน `solardb_dev`: mismatch ทั้งสอง policy เหลือ 0 และ correction event คงที่ policy ละ 23 รายการ
- Lead 882: Proposal เสร็จด้วย Activity 4758 วันที่ 4 ส.ค. 15:53 และ DEPOSIT_CLOSE เริ่มวันเวลาเดียวกัน
- `npm run test:sla`, TypeScript, targeted ESLint และ Next production build 97 routes ผ่าน; ESLint เหลือ warning เดิม 3 จุดในหน้า Lead
- ยังไม่ deploy Production
