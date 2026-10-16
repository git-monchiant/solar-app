---
name: ui-rules
description: กติกา UX/UI ของ SENA Solar v3 — โหลดก่อนแก้ UI ทุกครั้ง (ธีม, navigation, badge, mobile, หลักการยกของเดิมมาใช้)
---

# กติกา UX/UI — SENA Solar v3

กติกาชุดนี้ตกผลึกจากการรีวิวของเจ้าของโปรเจกต์ ต้องยึดตามนี้ก่อนออกแบบเอง
หลักใหญ่สุด: **"บอกหัวข้อมา = ยกบล็อกเดิมจากที่มีอยู่แล้วมาใช้ทั้งก้อน ไม่ประดิษฐ์ใหม่"**
(เช่น จะเพิ่มเมนู "ติดตั้ง" ให้โมดูลไหน → คัดลอกกลุ่มติดตั้งของโมดูล Sales มาเป๊ะๆ)

## ธีมสี
- Left menu (desktop) = navy `bg-blue-900` ตัวหนังสือโทนขาว/ฟ้าอ่อน (`text-blue-100/200/300`),
  active = `bg-white/15 text-white`, hover = `hover:bg-white/10`, เส้นในเมนู `border-white/10`
- Header ทุกหน้า = ขาว `bg-white border-b border-gray-200` (ห้าม gradient เขียวแบบเก่า)
  ยกเว้นหน้า /home ใช้ Header prop `dark` = navy ทึบกลืนกับพื้น hub
- ระบบเส้นคั่น 2 น้ำหนัก: `border-gray-100` = เส้นย่อยใน header block · `border-gray-200` = เส้นปิดท้าย header
- หน้า hub (/home): พื้น navy + การ์ดขาวเรียบมีเส้นกรอบ (แบบมินิมอล ไม่เอาการ์ดสีพาสเทล)

## Navigation — 2 ระบบแยกขาดจากกัน
- **Left menu (desktop)** = ตามโมดูลที่เลือก (registry `MODULES` ใน `src/lib/modules.tsx`)
  โมดูล `mobileOnly` ห้ามโผล่บน desktop
- **แถบล่าง (mobile)** = ตาม "role ที่สวมอยู่" คงที่ทุกหน้า (`mobileBarForRoles` ใน modules.tsx)
  ไม่ผูกกับโมดูล · ปุ่มที่มี `roles` gate → คนไม่มีสิทธิ์เห็นเป็นสีเทากดไม่ได้ (ช่องเมนูเท่ากันทุกคน)
- แก้เมนู/ปุ่มทุกอย่างที่ registry ใน modules.tsx เท่านั้น — ห้าม hardcode ใน component

## เมนูโซนคิว (inject)
- งานคิวประจำตัว (อนุมัติใบเสนอราคา, รอยืนยันรับเงิน) อยู่ใน `INJECTED_MENU_ITEMS`
  → ระบบต่อท้าย left menu ของ**ทุกโมดูล**ตามสิทธิ์ โดยมี**เส้นคั่น**แยกจากเมนูโมดูล
- อย่าใส่เมนูพวกนี้ fix ในโมดูลใดโมดูลหนึ่ง (ระบบ dedupe ด้วย href อยู่แล้ว)

## Badge
- ทรงวงกลมเป๊ะ: `min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full`
  (เลขเดี่ยว = วงกลม, หลายหลัก = pill) — ห้ามใช้ padding ล้วน (จะเป็นวงรี)
- สไตล์เดียวทั้งเมนู: active = `bg-primary text-white` · ปกติ = `bg-white/10 text-blue-100` (ไม่มี badge แดงพิเศษในเมนูซ้าย)
- **badge การ์ดโมดูล = จำนวนที่กดเข้าไปเห็นจริง** — นับจากเซ็ต step/sub ไม่ซ้ำ (union)
  เมนูบริบท/รายการสะสม (เช่น ส่งมอบแล้ว) ติด `noModuleCount` ไม่บวกเข้าการ์ด
- แถบล่าง mobile: เม็ดแดง `min-w-5 h-5 text-[11px]` แสดงเมื่อ >0

## กลุ่มเมนูพับได้ (children)
- หัวกลุ่มมี badge รวม + ลูกศร · เมนูย่อยมี bullet จุดกลมนำหน้า
- การกดของผู้ใช้ชนะ auto-open เสมอ · `defaultOpen: true` = กางค้างตั้งแต่เปิด
- **ความหมาย journey ห้ามมั่ว**: ออกใบรับประกัน (800) ไม่ใช่ส่วนหนึ่งของ "ติดตั้ง" (600/710/720)

## Mobile
- แก้ mobile ผ่าน breakpoint เท่านั้น (`max-md:` / `md:` / `sm:`) — **ห้ามกระทบ desktop**
- mobile แสดงน้อยกว่าได้ ไม่ต้องยัดทุกอย่าง (เช่น lead detail header ซ่อน avatar/ป้ายสถานะบนจอเล็ก)
- ป้ายบนแถบล่างใช้คำสั้น ("อนุมัติ", "ยืนยันรับเงิน") — ชื่อเต็มไว้เมนูซ้าย
- ปฏิทิน default: mobile = list · desktop = month (นัดติดตาม sales = list เสมอ)

## Component กลาง — ใช้ก่อนสร้างใหม่เสมอ
- โหลดหน้า: `ui/Loading` (กลางจอด้วย min-h-[55vh] — ห้ามเขียน spinner inline ระดับหน้า)
- Header หน้า list: `ListPageHeader` (slot `tabsLeft` = จำนวนรายการ+filter · `tabsRight` = "จัดเรียงข้อมูล"+dropdown)
- เมนู active/หัวเรื่องหน้า: hook `useActiveModule` / `useActiveMenuItem` (หัวเรื่อง = ชื่อเมนู)
- Dialog ยืนยัน: `useDialog` แบบมี title · ตัวเลข: `formatNumber`/`formatTHB` · วันที่ไทย: `formatThaiDate`
- ช่องทางลูกค้า: จัดกลุ่ม/ป้ายผ่าน `normalizeSourceKey` + `SOURCE_STYLES` (ชุดเดียวกับ dashboard/การ์ด)
- สถานะ lead: `getStatusLabel` + `getStatusColor` (pill สีเดียวกันทุกที่)
- ปุ่ม/ลิงก์กลมเล็ก ต้องใส่ `style={{ minHeight: 0 }}` (มี CSS กลางดัน min-height 44px ทำปุ่มเบี้ยว)

## กระบวนการทำงาน
- ก่อน redesign ของที่ผู้ใช้เคยจูน: เก็บสำเนาของเดิมไว้ (memory/ไฟล์) เผื่อสั่งแก้กลับ
- ตัวเลขทุกจุดต้อง cross-check กับข้อมูลจริง (badge = list ที่เปิด, การ์ด = ผลรวมเมนู)
- auto-scroll/snap ต้องเผื่อความสูง sticky header — วัดสด อย่าใช้ค่า fix
- เสร็จทุกงาน: `npx tsc --noEmit` + curl หน้าที่แก้ให้ได้ 200
