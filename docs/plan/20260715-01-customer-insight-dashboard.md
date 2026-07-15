# Customer Insight Dashboard III

## Status

done

## Goal

สร้าง `Dashboard III — Customer Insight` จากข้อมูล Customer Info ในแบบสอบถาม
Pre-Survey เพื่อให้ทีมเห็นภาพรวมว่า “ลูกค้าเป็นใคร”, “มีรูปแบบการใช้พลังงานอย่างไร”
และ “อะไรมีผลต่อการตัดสินใจติดตั้ง Solar” โดยใช้หน้ารายงานตัวอย่างเป็นแนวทางด้าน
การจัดวาง แต่ใช้คำถามและข้อมูลจริงของ Solar V0 เป็นหลัก

## Product Principles

1. **Actionable insight** — ทุกกราฟต้องช่วยงานขาย, ออกแบบระบบ หรือวางแผนสินค้า
   ไม่แสดงข้อมูลเพียงเพราะมีฟิลด์อยู่ในฐานข้อมูล
2. **One customer, one response** — ฐานนับคือหนึ่ง `lead_id` ต่อหนึ่งลูกค้า โดย join
   `leads` กับ `lead_data` แบบ 1:1
3. **Honest denominator** — เปอร์เซ็นต์ของแต่ละคำถามหารด้วยจำนวนผู้ตอบคำถามนั้น
   ไม่หารด้วยลีดทั้งหมด และต้องแสดง `n`/coverage กำกับเสมอ
4. **Missing is not No** — ค่า `NULL` หรือ JSON/CSV ว่างนับเป็น “ยังไม่ตอบ” แยกจาก
   คำตอบ `no`; ไม่ตีความข้อมูลว่างเป็นคำตอบเชิงลบ
5. **Multi-select is explicit** — กราฟคำถามหลายตัวเลือกต้องระบุว่าเลือกได้มากกว่า
   หนึ่งข้อ และผลรวมเปอร์เซ็นต์อาจเกิน 100%
6. **Same filters, same cohort** — ทุกการ์ดใช้ cohort เดียวกันตามตัวกรองส่วนกลาง
   ยกเว้นเมื่อการ์ดระบุฐานผู้ตอบเฉพาะคำถามอย่างชัดเจน
7. **Drill-downable** — คลิกแท่ง, donut segment, KPI หรือแถวคะแนนแล้วเปิดรายชื่อ
   Lead แบบเดียวกับ Dashboard I เพื่อให้ insight ไปสู่การลงมือทำได้
8. **Privacy by default** — หน้า summary ส่งเฉพาะ aggregate; ชื่อและข้อมูลลูกค้าจะ
   โหลดเมื่อผู้ใช้เปิด drill-down และยังผ่าน auth/role เดิม

## Population and Date Rule

- แนะนำให้ใช้ `leads.created_at` เป็นเกณฑ์ช่วงวันที่ เพื่อให้ cohort เทียบกับ
  Dashboard I/II ได้ตรงกัน
- นับเป็น “ผู้ตอบแบบสอบถาม” เมื่อ `lead_data` มีคำตอบอย่างน้อยหนึ่งฟิลด์ที่เป็น
  questionnaire จริง ไม่ใช่เพียงมี row จากการ backfill
- แสดงข้อมูลทุกสถานะ Lead ตามค่าเริ่มต้น และมีตัวกรองสถานะให้เลือก
- ค่าเริ่มต้นช่วงวันที่ใช้แบบเดียวกับ Dashboard I: `2026-01-01` ถึงวันนี้
- แสดง `จำนวน Lead ใน cohort`, `จำนวนผู้ตอบ`, `อัตราการตอบครบ` และ
  `อัปเดตข้อมูลล่าสุด` บนหัวรายงาน

## Recommended Dashboard Structure

### Global header and filters

- ชื่อ `Dashboard III` และคำอธิบาย `Customer Insight`
- ช่วงวันที่สร้าง Lead
- โครงการ
- Source
- สถานะ Lead
- ปุ่ม Reset และ Export PDF
- Filter banner ต้องติดไปใน PDF เพื่อบอกฐานข้อมูลของรายงาน

### Summary KPI row

1. จำนวนผู้ตอบแบบสอบถาม / จำนวน Lead ใน cohort
2. Questionnaire coverage — สัดส่วนคำถามที่ตอบ โดยแสดงครบ / บางส่วน / ยังไม่มี
3. ค่าไฟเฉลี่ยต่อเดือน พร้อม median เพื่อไม่ให้ค่าผิดปกติบิดภาพรวม
4. กลุ่มที่ตัดสินใจภายใน 1–3 เดือน

### Eight questionnaire cards

การ์ดยึดตามหัวข้อแบบสอบถามจริงแบบหนึ่งต่อหนึ่ง ไม่จัดกลุ่มใหม่:

1. **Customer Profile** — ประเภท/อายุบ้าน, หลังคา และผู้อยู่อาศัย
2. **Energy Profile** — ค่าไฟ 5 ช่วงตามแบบสอบถาม, ค่าไฟเฉลี่ย/median,
   เฟส, มิเตอร์ และช่วงใช้ไฟสูงสุด
3. **Lifestyle Assessment** — การอยู่บ้านกลางวัน, ทำงานที่บ้าน, แอร์,
   ผู้อยู่บ้าน, ธุรกิจ, วันทำงาน และการชาร์จ EV
4. **Future Home Assessment** — EV, EV Charger, ต่อเติมบ้าน, สมาชิกเพิ่ม,
   Smart Home และ Battery
5. **Energy Security Assessment** — สิ่งที่ต้องการใช้เมื่อไฟดับและการรับมือ
   เมื่อค่าไฟเพิ่ม 30%
6. **Home Health Check** — ประวัติหลังคารั่ว/ซ่อมหลังคา/ระบบไฟ/
   เปลี่ยนตู้ควบคุม พร้อมยอดมีความเสี่ยงอย่างน้อยหนึ่งข้อ
7. **Beyond Question** — บ้านผลิตไฟเอง, ความพร้อม EV, การใช้ชีวิตเมื่อไฟดับ
   และแนวโน้มใช้ไฟ 10 ปี
8. **Decision Making Factor** — ระยะเวลาตัดสินใจและ matrix คะแนนปัจจัย 1–5

## Interaction Design

- กราฟทุกชิ้นมี hover/focus state และรองรับ keyboard
- เมื่อคลิก category ให้เรียก drill-down แล้วเปิด popup รายชื่อ Lead แบบ Dashboard I
- Popup แสดงชื่อ, ID, บ้านเลขที่, วันที่สร้าง, สถานะ และข้อมูลคำตอบที่เกี่ยวข้อง
- หัวข้อ popup ต้องบอก filter ที่เลือก เช่น `ค่าไฟ 5,000–10,000 บาท (42)`
- ค่า 0 ยังกดได้และแสดง empty state เหมือน Dashboard I
- Desktop ใช้กริด 3 คอลัมน์; tablet 2; mobile 1 คอลัมน์
- ใช้สีตามความหมายคงที่ ไม่ใช้สีต่างกันเพียงเพื่อความสวยงาม และไม่พึ่งสีอย่างเดียว

## Technical Architecture

### Routes and navigation

- เพิ่มหน้าแนะนำที่ `/dashboard-customer` โดยแสดงชื่อเมนู `Dashboard III`
- เพิ่มเมนูใต้กลุ่ม Reports ต่อจาก Dashboard II
- สิทธิ์เริ่มต้นเหมือน Dashboard I/II: `admin`, `sales`, `solar`, `account`

### API

1. `GET /api/dashboard-customer`
   - รับ `from`, `to`, `project_id`, `source`, `status`
   - ตรวจ `requireAnyRole` สำหรับ `admin`, `sales`, `solar`, `account`
   - join `leads l` กับ `lead_data d`
   - สร้าง eligible-lead cohort ครั้งเดียว แล้วใช้กับทุก aggregate
   - query อิสระรันแบบ parallel และคืน aggregate เท่านั้น

2. `GET /api/dashboard-customer/drilldown`
   - รับ filter เดิม พร้อม `dimension` และ `value`
   - `dimension` ต้องผ่าน allowlist ห้ามนำ query parameter ไปต่อเป็น SQL โดยตรง
   - คืนเฉพาะข้อมูล Lead ที่ popup ต้องใช้
   - รองรับ single-select, multi-select CSV และ JSON factor score

3. `GET /api/report/dashboard-pdf?path=/dashboard-customer`
   - ส่งต่อ filter ทั้งหมดไปหน้า report
   - ใช้ print layout แบบ landscape และซ่อน navigation/controls

### Data normalization

- แยก label maps และ bucket definitions เป็น source of truth กลาง ไม่เขียน label
  ซ้ำระหว่าง API, หน้า dashboard และ popup
- CSV เช่น `outage_priorities`/`daytime_occupants` ใช้ `STRING_SPLIT`
- JSON เช่น `decision_factors` ใช้ `ISJSON` ก่อน `OPENJSON`
- เก็บ legacy mapping ชัดเจน โดยค่าที่ไม่รู้จักแสดง `อื่นๆ/ข้อมูลเดิม`
- ตัวเลขค่าไฟตัดค่าติดลบ/ศูนย์ออกจาก average แต่รายงานจำนวน invalid เพื่อ audit

### Schema and performance

- เวอร์ชันแรกไม่ต้องเพิ่ม migration เพราะข้อมูลอยู่ใน `lead_data` แล้ว
- ตรวจ execution plan และเวลาตอบ API ด้วยข้อมูลจริงก่อนตัดสินใจเพิ่ม index
- หากจำเป็น ค่อยเพิ่ม index บน filter หลักของ `leads` โดยไม่เพิ่ม index จำนวนมาก
  บนฟิลด์ questionnaire ที่มี cardinality ต่ำ

## Implementation Phases

### Phase 1 — Data audit and contract

- ตรวจจำนวน row ใน `lead_data`, coverage รายฟิลด์, invalid JSON/CSV และ legacy values
- ยืนยัน bucket ค่าไฟ, legacy mapping และนิยาม questionnaire completion
- สร้าง TypeScript response contract และ fixture สำหรับกรณี null/legacy/invalid

### Phase 2 — Aggregate and drill-down APIs

   - สร้าง eligible cohort และ aggregate ทั้ง 8 หัวข้อ
- สร้าง allowlisted drill-down query
- ทดสอบยอดรวมของแต่ละ category เทียบ SQL โดยตรง
- ตรวจ auth และ role scope

### Phase 3 — Dashboard UI

- สร้างหน้า, header, filter, KPI และ responsive card grid
- สร้าง chart primitives ด้วย CSS/SVG ตามแนวทาง dashboard เดิม
- เชื่อม drill-down popup และ empty/loading/error states
- เพิ่มเมนู Dashboard III

### Phase 4 — PDF and reporting quality

- ทำ landscape print layout ให้ใกล้โครงรายงานตัวอย่าง
- ใส่ filter banner, จำนวนผู้ตอบ และวันที่ออกรายงาน
- ตรวจ page break, chart clipping และฟอนต์ภาษาไทย

### Phase 5 — Verification and acceptance

- TypeScript, targeted ESLint, build และ `git diff --check`
- ตรวจ desktop/tablet/mobile และ keyboard navigation
- ตรวจทุก filter และ reset/persistence
- ตรวจทุก chart drill-down ว่าจำนวนใน popup ตรงกับตัวเลขบนกราฟ
- ตรวจ denominator, missing answers และ multi-select percentage
- ตรวจ PDF ด้วยข้อมูลน้อย, ข้อมูลมาก และ category ที่เป็นศูนย์

## Acceptance Criteria

- Dashboard III แสดงเฉพาะ insight จาก Customer Info/Questionnaire ตามนิยามในแผน
- ทุกตัวเลขมีฐานนับที่ตรวจสอบได้ และไม่รวม `NULL` เป็น `no`
- ตัวกรองทุกตัวมีผลกับทุกการ์ดและ drill-down เหมือนกัน
- คลิก category แล้วจำนวน Lead ใน popup ตรงกับกราฟ
- JSON/CSV เสียหรือ legacy value ไม่ทำให้ API หรือหน้า dashboard ล้ม
- หน้าใช้งานได้ตั้งแต่ mobile ถึง desktop และ PDF อ่านได้ในหน้า landscape
- ไม่มี schema migration หากผลทดสอบ performance ไม่ได้แสดงว่าจำเป็น

## Confirmed Decisions

- ช่วงค่าไฟใช้ตามแบบสอบถามจริง 5 ช่วง: `<2,000`, `2,000–<4,000`,
  `4,000–<6,000`, `6,000–10,000` และ `>10,000 บาท`
- ใช้ชื่อ `Dashboard III` และ URL `/dashboard-customer`
- ค่าเริ่มต้นรวม Lead ทุกสถานะและมีตัวกรองสถานะ รวมถึง `lost`
- รอบแรกมีทั้งหน้าเว็บ, drill-down และ PDF

## Out of Scope

- ไม่แก้คำตอบแบบสอบถามเดิมหรือ backfill คำตอบที่หาย
- ไม่สร้าง AI score/propensity score โดยไม่มีนิยามธุรกิจที่อนุมัติ
- ไม่เปลี่ยนแบบสอบถาม Pre-Survey ในงานนี้
- ไม่ deploy และไม่เปลี่ยน production database ระหว่างขั้นวางแผน

## Result

- Refined the page into a full-width hybrid dashboard matching Dashboard I/II, with clear report groups and eight questionnaire sections.
- Compacted the Executive Summary by 18% through tighter panel spacing and shorter summary tiles while retaining the primary number sizes and every data point.
- Added a role-protected Excel export that follows the current date, project, source, and status filters. The workbook contains one raw-data sheet, `Customer Info`, with one Lead per row, personal data, all eight questionnaire sections, and multi-choice answers joined with `;`.
- Verified the default export at 274 rows / 73 columns against the dashboard cohort, a Source-filtered export at 11 rows against the same dashboard filter, unauthenticated access (`401`), empty-filter handling (`422`), and an actual browser download.
- Removed the extra section-navigation and display-mode toolbar; all questionnaire details now appear directly on the page.
- Added low-sample indicators and count-first presentation when a question has fewer than 30 answers, avoiding misleading large percentages.
- PDF export renders the same complete questionnaire details as the screen.
- Verified TypeScript, targeted ESLint, desktop/mobile rendering without horizontal overflow, all eight sections, and PDF generation (`%PDF`, 696,214 bytes).

- สร้างหน้า `/dashboard-customer` และเมนู `Dashboard III` สำหรับ role
  `admin`, `sales`, `solar`, `account`
- แสดงการ์ดตรงตามแบบสอบถามทั้ง 8 หัวข้อ พร้อม KPI, filter, responsive layout,
  drill-down และ PDF
- ใช้ช่วงค่าไฟ `<2,000`, `2,000–<4,000`, `4,000–<6,000`,
  `6,000–10,000`, `>10,000 บาท` ตาม boundary ที่ยืนยัน
- ตรวจข้อมูลจริงแล้วทุก single-select series รวมเท่ากับจำนวนผู้ตอบ,
  multi-select รวมไม่น้อยกว่าจำนวนผู้ตอบ และ popup ตัวแทน 8/8 หัวข้อตรงกับกราฟ
- ผ่าน `tsc --noEmit`, desktop/mobile browser test และ PDF smoke test
- ปรับ Summary ด้านบนเป็น Panel แบบ Dashboard I จำนวน 4 ใบ จัด 2 ใบต่อแถว:
  Questionnaire Overview, กลุ่มลูกค้า, Sales Grade และระยะเวลาตัดสินใจ
- เชื่อม drill-down 20 ช่อง โดยยอด popup ตรงกับ summary ทุกช่อง และแสดง
  `ยังไม่ตอบ`, `ยังไม่ระบุ`, `ยังไม่จัดเกรด` โดยไม่ตัดข้อมูลว่างทิ้ง
