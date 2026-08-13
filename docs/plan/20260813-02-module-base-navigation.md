# Module-base Navigation — Hub → Module → Journey

**สถานะ:** design รอ approve (มี mockup กดได้ที่ `docs/mockup/20260813-02-module-base/index.html`)
**เป้าหมาย:** เลิกกองทุกเมนูไว้ที่ left menu/BottomNav เดียว → เปิดแอปเจอ **Hub การ์ดโมดูล** เลือกเข้าโมดูล แล้วเมนูในโมดูล = **journey ของกลุ่มนั้น** (อ่านจาก `journey_step/journey_sub` ที่ persist แล้ว) เพื่อรองรับโมดูลใหม่ที่กำลังมา (O&M: แจ้งซ่อม, สัญญา, ขาย O&M)

## โครง 3 ชั้น

```
เปิดแอป → HUB (การ์ดโมดูล + badge งานค้าง)
              ↓ เลือกโมดูล
          MODULE — desktop: left rail = journey ของโมดูล
                   mobile:  BottomNav = journey เดียวกัน (≤5 ปุ่ม) + ปุ่มกลับ hub
              ↓ กดรายการ
          หน้า lead เดิม (leads/[id]) — record เดียวใช้ร่วมทุกโมดูล
```

## โมดูลและ journey mapping

| key | โมดูล | เมนูใน module (journey codes) | หน้าเดิมที่ย้ายเข้า | role หลัก |
|---|---|---|---|---|
| seeker | **Seeker** | เก็บบ้าน → สนใจ → สร้างลีด · Map · Insights | seeker, seeker/map, seeker/dashboard | leadsseeker |
| sales | **Sales** | Today · ติดตาม (100) · จอง (200) · เสนอราคา (400) · ชำระเงิน (500) · อนุมัติใบเสนอ | today, pipeline(บางแท็บ), quotation-approvals | sales, sales_sup |
| install | **สำรวจ & ติดตั้ง** | ปฏิทิน · สำรวจ (300) · รอนัดติดตั้ง (600) · รอติดตั้ง (710) · กำลังติดตั้ง (720) | calendar, pipeline(แท็บช่าง), install checklist | solar, solar_sup |
| warranty | **Warranty** | รอออกใบ (800) · ขนานไฟ (900) · ส่งมอบแล้ว (1000) | warranty step, gridtie | solar, admin |
| om | **O&M** *(เร็วๆ นี้)* | แจ้งซ่อม → งานซ่อม → สัญญา O&M → ขาย O&M | — (จอง journey ช่วงเลข 1100+ หรือแยกสาย) | ใหม่ |
| account | **บัญชี** | รอยืนยันเงิน (210/520) · รายรับ/ใบแจ้งหนี้ · ตั้งค่าการชำระ | report/pending, report, payment-setup | account |
| package | **Package** | แคตตาล็อก · จัดการ | packages, packages/manage | admin, sales, solar |
| dashboard | **Dashboard** | ภาพรวม (I) · Customer (III) · Lifecycle · Dev (II) | dashboard*, lifecycle | admin, sup |
| setup | **Setup** | ตั้งค่า · ผู้ใช้ · LINE · Export · Errors | settings, app-users, line-users, export, client-errors | admin |

- สำรวจอยู่โมดูล "สำรวจ & ติดตั้ง" (ทีม solar เป็นคนทำ) แต่ฝั่ง Sales ยังเห็นสถานะได้จากหน้า lead — ไม่ซ่อนข้อมูล แค่จัดหน้างาน
- โมดูลไหนมีลูกค้าคนเดียวกันพร้อมกันได้ (บ้านกำลังติดตั้ง + งวดค้างจ่าย = โผล่ทั้ง install และ บัญชี) — ถูกต้องโดย design เพราะสองทีมมีงานคนละมุม กดเข้าไป record เดียวกัน

## กติกาสำคัญ (ตกลงไว้ตั้งแต่รอบ design แรก)

1. **ลูกค้า 1 record ใช้ร่วมทุกโมดูล** — `leads/[id]` ไม่แยกตามโมดูล O&M ในอนาคตก็ผูก record เดิม
2. **โมดูลเป็นชั้น navigation ไม่ใช่การรื้อ URL** — ทุก route เดิมอยู่ที่เดิม (LINE deep link ไม่พัง) เพิ่มแค่ hub + config เมนู → migrate ทีละโมดูลได้ ไม่ big bang
3. **การกรองตามโมดูล = ความสะดวก ไม่ใช่ความปลอดภัย** — สิทธิ์จริงยังคุมที่ API ตาม role เหมือนเดิม (สิ่งที่เห็น = สิทธิ์ role ∩ ช่วง journey ของโมดูล)
4. **เข้าแอป**: จำโมดูลล่าสุด (localStorage) · role เดียวเข้าโมดูลตัวเองตรงๆ (seeker เข้า Seeker เหมือน seekerMode เดิม) · โลโก้/ปุ่ม Home กลับ hub
5. **Dashboard**: ตัวเลขของ journey ฝังในโมดูลนั้น (แบบ Seeker Insights) + โมดูล Dashboard รวมสำหรับ admin/sup

## แผนลงมือ (ทีละเฟส ไม่พังของเดิม)

1. **Module config + Hub** — `src/lib/modules.ts` (ทะเบียนโมดูล: key, ป้าย, ไอคอน, เมนู→href+journey codes, roles) + หน้า `/home` การ์ดโมดูล + badge จำนวนจาก journey (query `GROUP BY journey_step` ถูกมาก) — ยังไม่แตะหน้าเดิมเลย
2. **BottomNav → module-aware** — nav รู้ว่าอยู่โมดูลไหน (จาก path + localStorage) แสดง journey ของโมดูลนั้น + ปุ่ม Home · desktop: rail ซ้ายแบบเดียวกัน (reuse กลไก BottomNav ที่มี role filter อยู่แล้ว)
3. **Pipeline pre-filter ตามโมดูล** — เข้า pipeline จากเมนูโมดูล = ส่ง `?step=` ให้เปิดแท็บนั้น (โครง journey รองรับแล้ว) · ระยะถัดไปค่อยย้ายเป็น server-side filter
4. **เก็บงาน role landing + ตัด nav เก่า** เมื่อทุกโมดูลครบ
5. **O&M** — เพิ่มโมดูลใน config + ตาราง/journey ของงานซ่อมเมื่อถึงคิว (โครงรองรับแล้ว)

## Mockup

`docs/mockup/20260813-02-module-base/index.html` — กดได้ 3 จอ: Hub → โมดูล Sales (desktop + left rail) → โมดูลสำรวจ&ติดตั้ง (มือถือ + BottomNav) ตัวเลข badge ใช้ข้อมูลจริงจาก solardb_v3
