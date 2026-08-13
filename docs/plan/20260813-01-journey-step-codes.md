# Customer Journey Step Code — เลข INT เว้นช่วง + ตาราง label

**สถานะ:** design เคาะแล้ว (step 100,200,… · sub ฝัง step ในตัว 110,120,…) — รอสั่งเริ่มเฟส 1
**เป้าหมาย:** เก็บ "ลูกค้าอยู่ขั้นไหน" ลง DB เป็นคอลัมน์ชัดๆ ให้ทุก query ดึงตรงได้ (`WHERE journey_step=500` หรือ `WHERE journey_sub=520`) แทนที่ปัจจุบันที่ pipeline / today / dashboard / BI ต่างคน derive เองด้วยเงื่อนไขหลายชั้นและ**นิยามไม่ตรงกัน**

## ทำไมต้องทำ (สิ่งที่เจอจากการ audit โค้ด)

- มีฟังก์ชัน `computeStageCode()` ใน `src/lib/constants/statuses.ts:58` อยู่แล้ว และ comment อ้างว่า persist ลง `leads.stage_code` — **แต่คอลัมน์นั้นไม่เคยถูกสร้างจริง** มีแค่ BI (`/api/v1/bi/leads`) คำนวณตอนอ่าน
- ผู้บริโภคแต่ละรายนิยาม "ขั้น" เองไม่ตรงกัน:
  - pipeline bucket ฝั่ง client 13 tab (`pipeline/page.tsx:61-94`) — tab ชำระมัดจำ กับ รอนัดติดตั้ง ซ้อนทับกัน, lead จ่าย**เช็ค**ที่ยังไม่ยืนยัน ตกหล่นไม่เข้า tab ไหนเลย, `closed` ไม่มี tab
  - today ใช้ SQL 14 ก้อน (`api/(lead)/today/route.ts`) — waitInstall ใช้ paid_count ขณะ pipeline ใช้ ready_count → เคสเช็คนับไม่ตรงกัน
  - dashboard หลักนับ "ติดต่อได้" จากเงินจองยืนยันแล้ว แต่ dashboard-dev นับจากสลิปที่แค่ submit → เลขสองหน้าไม่เท่ากัน
- sub-step ในฟอร์ม (แพ็คเกจ/ยืนยัน/ชำระ ฯลฯ) อยู่ localStorage รายเครื่อง — ไม่ใช่ข้อมูลระบบ

## หลักออกแบบ: INT เว้นช่วง · sub ฝังเลข step ในตัว

- `journey_step INT` เว้นทีละ 100: `100, 200, …, 1000` · terminal `9800, 9900` — ขั้นใหม่แทรกระหว่าง 300/400 → `350`
- `journey_sub INT` ฝัง step ในตัว เว้นทีละ 10: step 100 → `110, 120, 130, 140` · step 500 → `510, 520` · **step ที่ไม่มี sub = 0**
  - เลข sub ตัวเดียวระบุตำแหน่งได้ทั่วระบบ (`journey_sub=520` รู้ทันทีว่าเป็นขั้นชำระเงิน) และ ORDER BY ได้ตรงๆ
  - แทรก sub ใหม่ระหว่าง 510/520 → `515`
- ลำดับอยู่ในตัวเลขเอง ไม่ต้องมีคอลัมน์ seq แยก
- แสดงผล: โชว์ sub (`520`) ถ้ามี, ไม่มีก็โชว์ step (`400`)
- ตาราง master `journey_steps` เหลือหน้าที่: ป้ายไทย + ทะเบียน code ที่ valid (ให้ SQL report join ได้ และ validate ใช้เช็ค)
- รองรับ O&M ในอนาคต: ช่วง 1100–9700 ว่างเหลือเฟือ หรือเพิ่มคอลัมน์ journey แยกสายทีหลังได้
- ข้อดีแฝง: ค่าในคอลัมน์คำนวณซ้ำได้เสมอจากกติกา → ถ้าวันหน้าอยาก renumber catalog จริงๆ ก็แค่แก้กติกา + รัน backfill รอบเดียว ไม่มีข้อมูลประวัติผูกกับเลข

## Catalog (seed)

precedence การคำนวณ: ไล่จาก terminal ขึ้นบน — ตัวแรกที่เข้าเงื่อนไขชนะ ทุก lead ได้ code เดียวเสมอ

| step | sub | ป้ายไทย | เงื่อนไข | legacy (BI) |
|---|---|---|---|---|
| 100 | 110 | ยังไม่ติดต่อ | status=pre_survey, ไม่มีผลติดต่อใน lead_activities | 01-0 |
| 100 | 120 | ติดต่อไม่ได้ | มีแต่ "ติดต่อไม่ได้" | 01-0 |
| 100 | 130 | ติดต่อได้ ยังไม่สะดวกคุย | ติดต่อได้ ยังไม่มี activity เสนอขาย | 01-0 |
| 100 | 140 | ระหว่างเสนอขาย | มี activity เสนอขาย (นิยามเดียวกับ lifecycle sales_pitch_at) | 01-0 |
| 200 | 210 | จอง รอยืนยันเงิน | status=pre_survey-01 | 02-1 |
| 200 | 220 | จองแล้ว | status=pre_survey-02 | 02-2 |
| 300 | 310 | นัดสำรวจ | status=survey และ survey_date > วันนี้ | 03-1 |
| 300 | 320 | กำลังสำรวจ | status=survey (ถึงวัน/เลยวัน/ไม่มีวันนัด) | 03-2 |
| 400 | 0 | รอใบเสนอราคา | status=quote | 04-0 |
| 500 | 510 | รอเสนอลูกค้า / รอชำระ | status=order, ready=0, paid=0 | 05-1 |
| 500 | 520 | รอยืนยันเงินงวด *(ใหม่)* | status∈(order,install), ready≥1, paid=0 — สลิป/เช็ครับแล้ว บัญชียังไม่ยืนยัน (อุดรูเช็คหายจากทุก tab) | 05-1 |
| 600 | 0 | มัดจำแล้ว รอนัดติดตั้ง | status∈(order,install), paid≥1, ยังไม่มี install_date | 06-0 |
| 700 | 710 | รอติดตั้ง | install_date > วันนี้ | 07-1 |
| 700 | 720 | กำลังติดตั้ง | install_date ≤ วันนี้ | 07-2 |
| 700 | 730 | ติดตั้งเสร็จ | install_completed_at/install_done_at ไม่ว่าง | 07-3 |
| 800 | 0 | รอออกใบรับประกัน | status=warranty | 08-0 |
| 900 | 0 | ขอขนานไฟ | status=gridtie (อนาคตแตก sub: ยื่น กฟ./ตรวจ/มิเตอร์) | 09-0 |
| 1000 | 0 | ส่งมอบแล้ว | status=closed | 10-0 |
| 9800 | 0 | ส่งกลับ Seeker | status=returned | 98-0 |
| 9900 | 0 | ยกเลิก | status=lost | 99-0 |

นิยาม count กลาง (ตาม `api/(lead)/leads/route.ts:46-47`): `paid` = งวด order ที่ `confirmed_at` แล้ว · `ready` = งวดที่ `confirmed_at` หรือ `cheque_received_at`

## Schema (additive ตามกติกา migrations-v3)

```sql
CREATE TABLE journey_steps (
  step_code INT NOT NULL,
  sub_code  INT NOT NULL,          -- 0 = ไม่มี sub
  label_th  NVARCHAR(100) NOT NULL,
  active    BIT NOT NULL DEFAULT 1,
  CONSTRAINT PK_journey_steps PRIMARY KEY (step_code, sub_code)
);

ALTER TABLE leads ADD
  journey_step INT NULL,
  journey_sub  INT NULL,
  journey_updated_at DATETIME2 NULL;

CREATE INDEX IX_leads_journey ON leads(journey_step, journey_sub);
```

คอลัมน์เป็น NULL-able → โค้ด v2 ไม่รู้จักก็ไม่พัง (rollback-safe ตามกติกา 3 เดือนแรก)

## สถาปัตยกรรมการคำนวณ

- **`src/lib/journey-rules.mjs`** (ใหม่, pure JS ไม่มี dependency) — source of truth เดียว: `JOURNEY_STEPS` (catalog ข้างบน), `computeJourney(input) → {step, sub}`, `toLegacyStageCode()` — import ได้ทั้งจากแอป (tsconfig `allowJs`) และสคริปต์ node
- **`src/lib/journey.ts`** — `refreshJourney(dbOrTx, leadId)`: SELECT ข้อมูล lead + count เงิน + flag การติดต่อ → คำนวณ → UPDATE 3 คอลัมน์ (ข้ามถ้าไม่เปลี่ยน) รองรับ transaction แบบเดียวกับ `syncOrderPaidFlags` (`src/lib/payments-helpers.ts`)
- **จุด hook 8 กลุ่ม** (เรียกหลังเขียนข้อมูล ใน tx เดิมถ้ามี):
  1. `PATCH /api/leads/[id]` (status/วันที่/ทุกอย่าง)
  2. `slips/[id]` submit/unsubmit/delete
  3. `payments` POST ยืนยันเงิน (+ หลัง syncOrderPaidFlags)
  4. `payments/[id]` แก้/ยกเลิกยืนยัน
  5. `quotations/[id]/action` (→ order)
  6. `return-to-prospect`
  7. `leads/[id]/activities` POST (ขยับ funnel การติดต่อ เฉพาะช่วง step 100)
  8. สร้าง lead ใหม่ (`/api/leads` POST, website-lead, gmail sync) → step 100 / sub 110
- **เคสขึ้นกับเวลา** (310→320, 710→720): `flipJourneyDatesIfDue()` — SQL flip 2 คำสั่งเรียกตอนโหลดหน้า list/dashboard/BI (`/api/leads`, `/api/today`, `/api/lifecycle`, `/api/dashboard-dev`, `/api/v1/bi/leads`) throttle แบบเช็ควัน = **รันจริงวันละครั้ง** (request แรกหลังข้ามวันจากหน้าไหนก็ได้รวม dashboard — await ก่อน query จึงเห็นข้อมูลถูกทันที; รันซ้ำในวันเดียวกันพิสูจน์ได้ว่า no-op เสมอ เพราะเซ็ตแถวที่ flip ได้เปลี่ยนแค่ตอนข้ามวันหรือตอนมีการเขียนซึ่ง hook จัดการแล้ว) **ไม่ต้องมี cron/timer** · มีผลเฉพาะรายการที่ไม่มีการแก้วันที่ — รายการที่ถูก edit วันที่ hook คำนวณใหม่เองทุกทิศทางอยู่แล้ว · computed column ของ SQL Server ทำไม่ได้เพราะติดกติกาข้าม table + GETDATE()

## Migration / เครื่องมือ

1. แก้ `scripts/tools/deploy_migrations.mjs` ให้ตรงกับที่ README migrations-v3 อ้าง: รองรับ `--dir=` + เพิ่ม `solardb_v3` ใน whitelist (ตอนนี้รับแค่ solardb/solardb_dev)
2. `scripts/migrations-v3/20260813-XXXX_journey_steps.sql` — สร้าง master + seed + คอลัมน์ + index (idempotent guard ตาม house style)
3. `scripts/tools/backfill_journey.mjs` — สคริปต์เดียวทำ 3 หน้าที่:
   - **dry-run** (ไม่ใส่ `--yes`) = VALIDATE: เทียบ stored vs คำนวณสดทุก lead, พิมพ์ mismatch + การกระจายต่อ code, exit 1 ถ้าไม่ตรง — ต้อง **0 mismatch** ก่อนให้หน้าไหนใช้จริง และรันซ้ำหลังใช้งานจริง 2-3 วันเพื่อพิสูจน์ว่า hook ครบ
   - **`--yes`** = backfill/เขียนค่าที่ต่าง — ใช้เป็นเครื่องมือ self-heal แบบ manual
     (รันตอน validate เจอ mismatch หรือหลังเหตุการณ์ผิดปกติ เช่น server ดับกลางคัน)

## ลำดับการย้ายผู้บริโภค (ทีละหน้า วัดผลได้)

1. **Today** (`api/(lead)/today/route.ts`) — SQL 14 ก้อนยุบเหลือ `WHERE journey_step=...` (ชัดสุด วัด count ก่อน/หลังง่าย)
2. **BI** — ส่ง `journey_step/journey_sub` + คง `stage_code` legacy ผ่าน `toLegacyStageCode`
3. **Pipeline** — tab = union ของ code (label จาก master); แก้ tab ซ้อน + เพิ่ม tab ส่งมอบ (1000)
4. **Dashboard / dashboard-dev** — station/funnel อ่านจาก journey → นิยาม "ติดต่อได้" เป็นอันเดียวกันทั้งระบบ

หมายเหตุ: tab ที่ split ด้วยเวลา (รอติดตั้ง/กำลังติดตั้ง) UI ยัง split สดด้วย date เพื่อความเป๊ะระดับนาที — ส่วนค่าใน DB สดภายใน ~10 นาทีแรกที่มีคนเปิดหน้า list หลังข้ามวัน (ผ่าน flipJourneyDatesIfDue)

## นอกขอบเขตรอบนี้

- sub-step ของฟอร์มในหน้า lead (localStorage) — คนละแกนกับ journey (ตำแหน่ง wizard ไม่ใช่สถานะลูกค้า) ถ้าอยาก persist ทำเป็น `lead_wizard_state` แยกทีหลัง
- O&M journey — โครงรองรับแล้ว (ช่วงเลข 1100–9700 หรือคอลัมน์แยกสาย) แต่ยังไม่ seed

## การตรวจรับ

- snapshot จำนวนต่อ tab/bucket ก่อน-หลังทุกเฟส ทุก delta ต้องอธิบายได้ (เช่น เคสเช็คโผล่ใน sub 520)
- validate script = 0 mismatch หลัง backfill และหลังใช้งานจริงหลายวัน
- เดินทดสอบ lead จริง 1 ตัวครบเส้น: สร้าง → บันทึกติดต่อ → เสนอขาย → สลิป → ยืนยัน → สำรวจ → ใบเสนอ → order → เช็ค → ยืนยัน → นัดติดตั้ง → เสร็จ → warranty → ปิด (ต้องไล่ code ตาม catalog) + เส้น undo (ยกเลิกยืนยันเงิน, ส่งกลับ seeker)
- ทดสอบ flip เวลา: ตั้ง survey_date พรุ่งนี้ → รัน nightly → ไม่ flip; ตั้งวันนี้ → flip เป็น sub 320
