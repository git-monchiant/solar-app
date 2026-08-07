# ช่วงราคาขายของ Package (Package Price Periods)

- วันที่: 2026-08-07
- สถานะ: done (dev) — รอ deploy prod
- ไฟล์ที่เกี่ยว: `scripts/migrations/141_package_price_periods.sql`,
  `src/app/api/(config)/packages/[id]/periods/route.ts`,
  `src/app/(app)/packages/manage/page.tsx`

## ที่มา

ราคาขาย/ผ่อนต่อเดือน/ประหยัดต่อเดือน + วันเริ่ม-วันหมดอายุ เดิมเก็บบนตาราง
`packages` ชุดเดียว จึงไม่มีประวัติว่าราคาเปลี่ยนเมื่อไหร่ (เจอเคสจริง: ใบเสนอราคา
7.68 kWp + Battery เคยออกที่ 290,000 แต่ในระบบตอนนี้เป็น 306,000 โดยไม่มีร่องรอย)

## สิ่งที่ทำ

1. **ตาราง `package_price_periods`** — 1 package มีได้หลายช่วงราคา
   - คอลัมน์: `price`, `monthly_installment`, `monthly_saving`, `start_date`,
     `expire_date`, `is_active`, `note`, `created_by`
   - `UX_ppp_one_active` (filtered unique index) บังคับให้ active ได้ package ละ 1 ช่วง
   - backfill 1 แถวต่อ package จากค่าปัจจุบันบน `packages`

2. **Mirror กลับไปที่ `packages`** — ทุกครั้งที่บันทึก ช่วงที่ active จะถูกคัดลอกลง
   `packages.price/monthly_installment/monthly_saving/start_date/expire_date`
   ทำให้โค้ดเดิมทั้งหมด (ใบเสนอราคา, dropdown เลือก package, dashboard, PDF)
   ทำงานต่อได้โดยไม่ต้องแก้แม้แต่บรรทัดเดียว

3. **กติกาล็อกราคา** — ช่วงที่ **active และเริ่มใช้ไปแล้ว** (`start_date <= วันนี้`)
   แก้ราคา/ผ่อน/ประหยัดไม่ได้ และลบไม่ได้ ต้องเพิ่มช่วงใหม่แล้วตั้งเป็นใช้งานแทน
   - บังคับทั้งฝั่ง UI (แสดงเป็นข้อความ + 🔒) และฝั่ง API (คืน 409)
   - แก้ `expire_date` ได้ เพื่อปิดช่วงราคาเดิม

4. **หน้า Package Management** — ย้ายช่อง "ราคา" ออกจากบล็อกข้อมูลหลัก มาอยู่ใน
   บล็อก "การขาย & ช่วงเวลาใช้งาน" เป็นรายการหลายแถว มี radio เลือกช่วงที่ใช้งาน

## กับดักที่เจอระหว่างทำ

คอลัมน์ `DATE` จาก mssql driver กลับมาเป็น `Date` object การทำ `String(d).slice(0,10)`
ได้ `"Sat Aug 01"` ซึ่ง V8 ตีความเป็นปี **2001** ทำให้ทุกช่วงถูกมองว่า "เริ่มไปแล้ว"
และล็อกหมด แก้ด้วย `dayOf()` ที่เช็ค `instanceof Date` ก่อน แล้วเทียบเป็น string

## ทดสอบบน dev แล้ว

| กรณี | ผล |
|---|---|
| GET ช่วงที่ active + เริ่มแล้ว | `locked: true` |
| แก้ราคาช่วงที่ล็อก | 409 |
| แก้เฉพาะวันหมดอายุ | 200 |
| เพิ่มช่วงใหม่ + ตั้งใช้งาน | 200, `packages.price` อัปเดตตาม |
| ไม่เลือก active เลย | 400 |
| insert active ซ้ำตรง DB | ถูก unique index บล็อก |
