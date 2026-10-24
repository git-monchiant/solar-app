# UI Consistency Cleanup (P1 + P2)

**Branch:** `v3-ui-consistency` (แตกจาก `v3`)
**ที่มา:** audit "clean v2 ux/ui, reusable" — ตรวจว่ามีจุดไหนไม่ใช้ของกลางที่มีอยู่แล้ว (useDialog / Dropdown / formatters) แล้วแก้บน v3 อย่างเดียวตามที่ตกลง (ไม่แตะ main)

## Scope ที่ทำ

### P1a — dialog เบราว์เซอร์ → `useDialog` (8 จุด / 7 ไฟล์)

| ไฟล์ | จุด |
| --- | --- |
| `settings/page.tsx` | confirm ตัดการเชื่อม Gmail, confirm ลบไฟล์ checklist |
| `components/calendar/EventCalendarList.tsx` | confirm ลบ block |
| `export/page.tsx` | alert export ไม่สำเร็จ |
| `report/pending/page.tsx` | alert ยืนยันรับเช็คไม่สำเร็จ |
| `dashboard/page.tsx` · `dashboard-dev/page.tsx` | alert ดาวน์โหลด PDF ไม่สำเร็จ |
| `dashboard-customer/page.tsx` | alert สร้าง Excel ไม่สำเร็จ |

ใช้ object form ตาม convention เดิม: `{ title, message, variant, confirmText }`

### P1b — `<select>` เบราว์เซอร์ → `<Dropdown>` (20 จุด / 9 ไฟล์)

`packages/manage` (5), `dashboard` (3), `today` (2), `pipeline` (2), `settings` (2), `report` (2), `OrderStep` (2), `dashboard-dev` (1), `GridTieForm` (1)

- เพิ่ม prop `heightClassName` ให้ `Dropdown` (default `h-8` เท่าเดิม) เพื่อให้ฟอร์มที่ใช้ input `h-9` (packages) และ `h-11` (GridTieForm) แปลงได้โดยความสูงไม่เพี้ยน
- select แบบ filter/sort ใช้ pattern `onChange={v => { if (v) ... }}` — กัน behavior "คลิกตัวเลือกเดิมแล้วเคลียร์ค่า" ของ Dropdown ไม่ให้ทำ state หลุด union type (คลิกซ้ำ = ปิดเมนูเฉยๆ เหมือน select เดิม)
- select แบบ form field ที่ค่าว่างมีความหมาย (signer ใน settings, loan_bank ใน OrderStep, การไฟฟ้าใน GridTieForm) ยอมให้เคลียร์เป็น null/""

### P2 — `toLocaleString` เขียนเอง → formatters กลาง (~40 จุด / 24 ไฟล์)

- เงินบาท → `formatTHB` (รวม helper ท้องถิ่น `money`, `fmtBaht`, `baht` ที่คง signature เดิมแต่เปลี่ยน implementation)
- จำนวนนับ (BTU, KPI, จำนวนบ้าน) → `formatNumber`
- วันเวลา → `formatThaiDate(..., { time: true })`
- เพิ่ม opt `timeZone` ให้ `formatThaiDate` เพื่อรองรับจุดที่ปักหมุด `Asia/Bangkok` โดยตั้งใจ (`line-users`, `LinePickerModal` — timestamp จาก DB ไม่มี offset)

### จุดที่ตั้งใจเว้น (พร้อมเหตุผล)

- `src/lib/docs/survey-report.js` — ตัวสร้างเอกสาร PDF เป็น plain JS มี format helper ของตัวเอง เสี่ยงกระทบเอกสารจริง ควรรวมตอนรื้อ template เอกสาร
- `quotation-pdf/[id]/route.ts:529` — format เปอร์เซ็นต์ (`maximumFractionDigits: 2`) ไม่มี formatter กลางที่ความหมายตรง
- lint error `react-hooks/set-state-in-effect` 7 จุด (dashboard, seeker/dashboard ฯลฯ) — ของเดิมในโค้ด ไม่เกี่ยวกับงานนี้

## ยกไปทำใน v3 UI rework (P3/P4 จาก audit เดิม)

- แปลง 14 ไฟล์ที่เขียน modal shell เองไปใช้ `ModalBase` + ใช้ `ModalCloseButton` (ตอนนี้ 0 ผู้ใช้)
- inline `<svg>` → `icons.tsx` (seeker 31, BottomNav 27, leads/[id] 22)
- `fetch` ดิบ 27 จุด → `apiFetch` (ไม่ redirect login ตอน 401 / ไม่ได้ error message จริง)
- ความสูงปุ่มนอกสเกล (h-7 ×58, h-10 ×26, h-12 ×10, h-14 ×6), `text-[Npx]` ในแอปจริง, hex สีตรงๆ → token

## การตรวจ

- `tsc --noEmit` ผ่านหลังแต่ละ phase (P1a / P1b / P2)
- `eslint` ไฟล์ที่แก้: ไม่มี error ใหม่ (7 error ที่เจอเป็นของเดิม)
- `next build` ผ่าน
