# แผน: ทำเงื่อนไข/ข้อกำหนดในใบเสนอราคาให้แก้ไขได้จากหน้าจอ

- **สถานะ**: backlog
- **branch**: `feature/quotation-terms-revise` (ฐาน `release/sla-only` · tag `base/quotation` = `e440246`)
- **วันที่จัดทำ**: 27 ส.ค. 2569

## เป้าหมาย

ย้ายข้อความเงื่อนไข/ข้อกำหนดของใบเสนอราคาจากที่ฝังอยู่ในโค้ด ออกมาเป็นข้อมูลที่แก้ไข
เพิ่ม ลบ และเรียงลำดับได้จากหน้าจอ แบบเดียวกับที่ Package Management จัดการรายการ
อุปกรณ์และช่วงราคา โดยที่ใบเสนอราคาที่อนุมัติไปแล้วต้องคงถ้อยคำเดิมไว้ตลอด

## การตัดสินใจที่ผู้ใช้ยืนยันแล้ว

| # | ประเด็น | คำตอบ |
|---|---|---|
| 1 | ใครแก้ได้ | **admin, Sale, Sale Manager** — แก้ได้ทั้งต้นแบบและรายใบ (แบบ 2) |
| 2 | ใบที่อนุมัติแล้ว | **ไม่ย้อนหลัง** — คงถ้อยคำเดิมไว้ตลอด |
| 3 | ขอบเขต | **ทุกหัวข้อ** — รับประกัน + หมายเหตุ + O&M + เงื่อนไขเพิ่มเติม |
| 4 | ตัวเลขที่วิ่งตามข้อมูล | **ทาง ค — ปุ่มแทรกค่า** พร้อมพรีวิวผลจริง (แอดมินไม่ต้องพิมพ์รหัสเอง) |

### ข้อสมมติที่ต้องยืนยันก่อนเริ่มเฟส 1

ผู้ใช้ระบุ 3 role ที่แก้เงื่อนไขได้ แต่ `QUOTATION_MANAGE_ROLES` ปัจจุบันมี 5 role
(`admin`, `sales`, `sales_sup`, `solar`, `solar_sup`) ซึ่ง solar / solar_sup สร้างและแก้
ใบเสนอราคาได้อยู่แล้ว แผนนี้จึงตั้งไว้ว่า

- **แก้ต้นแบบ** — `admin`, `sales`, `sales_sup` เท่านั้น (ตามที่ผู้ใช้ตอบ)
- **แก้เงื่อนไขเฉพาะใบ** — ใครก็ตามที่แก้ใบนั้นได้อยู่แล้ว (`QUOTATION_MANAGE_ROLES` ทั้ง 5)

ถ้าต้องการให้ solar / solar_sup แก้รายใบไม่ได้ด้วย ต้องแจ้งก่อนเริ่มเฟส 2

## สภาพปัจจุบัน

ข้อความเงื่อนไขทั้งหมดอยู่ใน `getQuotationLegalContent()` ที่
[src/lib/quotation-terms.ts](../../src/lib/quotation-terms.ts) เป็นสตริงในโค้ด
ประกอบเป็น 2 โปรไฟล์ (`full_install` / `additional_install`) แล้วส่งให้
[quotation-pdf route](<../../src/app/api/(doc)/quotation-pdf/[id]/route.ts>) เรนเดอร์

### จำแนกบรรทัดตามความยาก (นับจากโปรไฟล์ `full_install`)

| ประเภท | จำนวน | รายการ |
|---|---|---|
| ข้อความคงที่ล้วน | 11 | 1.1–1.3 · 2.1–2.4 · 2.5 · เงื่อนไขเพิ่มเติม 3 บรรทัด |
| มีตัวเลขวิ่งตามใบ | 2 | 1.4 ยืนราคา N วัน · 2.6 รวม O&M N ปี ปีละ N ครั้ง |
| ทั้งบล็อกโผล่/หายตามการตั้งค่า | 1 หัวข้อ + 3 | หัวข้อ 3 (N ปี) · 3.1 ล้างแผง · 3.2 thermoscan · 3.3 ตรวจกายภาพ |

### ข้อจำกัดที่ต้องแก้ไปพร้อมกัน

1. **เลขข้อฝังในตัวข้อความ** — `"1.1) การรับประกัน..."` ทำให้แทรกข้อกลางไม่ได้
2. **เลขหัวข้อเลื่อนอัตโนมัติอยู่แล้ว** — ปิด O&M แล้ว "เงื่อนไขเพิ่มเติม" เด้งจากข้อ 4 เป็น 3
   ([quotation-terms.ts:277](../../src/lib/quotation-terms.ts)) พฤติกรรมนี้ต้องคงไว้
3. **ข้อความไม่ถูก snapshot** — แก้โค้ดแล้วใบที่อนุมัติไปแล้วเปลี่ยนตามทันทีเมื่อ regenerate PDF
4. **PDF ตัดหน้าด้วย heuristic นับแถว** — `>9` ดันหมายเหตุไปหน้า 2, `>14` ดันทั้งหมด
   ([route.ts:570](<../../src/app/api/(doc)/quotation-pdf/[id]/route.ts>)) เงื่อนไขที่ยาวขึ้นได้อิสระจะทับเลขหน้า

## สถาปัตยกรรมที่เสนอ

### 1. โครงตาราง (ถอดแบบจาก `package_price_periods`)

ยึดรูปแบบเดียวกับช่วงราคา Package — เก็บเป็นเวอร์ชัน มี published ได้ครั้งละชุด
บังคับด้วย filtered unique index ทำให้ได้ประวัติการแก้ฟรีโดยไม่ต้องมีตาราง audit แยก

```
quotation_term_sets            ชุดเงื่อนไข 1 เวอร์ชัน
  id, profile ('full_install' | 'additional_install')
  status ('draft' | 'published' | 'archived')
  name, note, published_at, published_by, created_at, created_by
  UNIQUE filtered index: published ได้ profile ละ 1 ชุด
  UNIQUE filtered index: draft ได้ profile ละ 1 ชุด

  └── quotation_term_sections  หัวข้อ
        id, term_set_id, title (มี placeholder ได้)
        page (1 | 2)                     -- หน้าที่หัวข้อไปโผล่
        kind ('normal' | 'om_services')  -- om_services = บล็อกที่วนตามบริการที่เปิด
        show_when ('always' | 'om_enabled')
        sort_order, is_active

        └── quotation_term_lines  บรรทัดข้อความ (ไม่มีเลขข้อนำหน้า)
              id, section_id, body (มี placeholder ได้)
              page (1 | 2)               -- 2.1-2.4 อยู่หน้า 1 แต่ 2.5-2.6 อยู่หน้า 2
              show_when ('always' | 'om_cleaning' | 'om_thermoscan' | 'om_visual')
              is_locked BIT              -- ข้อกฎหมายที่ห้ามปิดตอนแก้รายใบ
              sort_order, is_active
```

**การแก้ = สร้างเวอร์ชันใหม่** — กด "แก้ไข" ระบบ clone ชุด published เป็น draft
แก้ใน draft แล้วกด "เผยแพร่" จึงสลับ draft → published และดัน published เดิม → archived
ใบเสนอราคาบันทึก `term_set_id` ที่ใช้ไว้ จึงตามรอยได้เสมอว่าใบไหนใช้เงื่อนไขเวอร์ชันไหน

### 2. ตัวแทนค่า (placeholder) และปุ่มแทรก

เก็บในฐานข้อมูลเป็น `{{key}}` แต่**หน้าจอไม่ให้พิมพ์เอง** — แสดงเป็นป้ายสีที่ลบได้ทั้งก้อน
แต่พิมพ์ทับข้างในไม่ได้ พร้อมแถบปุ่ม "แทรกค่า" และบรรทัดพรีวิวผลจริงใต้ช่องพิมพ์

| key | ป้ายที่ผู้ใช้เห็น | มาจาก |
|---|---|---|
| `valid_days` | จำนวนวันยืนราคา | `quotations.valid_days` |
| `om_years` | จำนวนปี O&M | `document_inputs.om.coverage_years` |
| `om_visits` | จำนวนครั้ง/ปี (รวม) | ความถี่ร่วมของบริการที่เปิด (null ถ้าไม่เท่ากัน) |
| `install_warranty_years` | จำนวนปีรับประกันงานติดตั้ง | ค่าตั้งใหม่ (เดิม hardcode "2 ปี" ในข้อ 2.5) |
| `service_visits` | จำนวนครั้ง/ปี (ของบริการนี้) | เฉพาะใน section `kind='om_services'` |
| `service_years` | จำนวนปี (ของบริการนี้) | เฉพาะใน section `kind='om_services'` |

หน้าจอต้องเตือนเมื่อผู้ใช้แทรก `service_*` นอก section `om_services`

### 3. เครื่องไล่เลขข้อ

ไล่เลขตอนเรนเดอร์ ไม่เก็บลงฐานข้อมูล:

- นับเฉพาะ section ที่ผ่านเงื่อนไข `show_when` แล้ว → 1, 2, 3, ...
- นับ line ในแต่ละ section → `<เลข section>.<ลำดับ>`
- ผลที่ได้จะทำให้พฤติกรรม "ปิด O&M แล้วเงื่อนไขเพิ่มเติมเด้งจากข้อ 4 เป็น 3" เกิดขึ้นเอง
  โดยไม่ต้องเขียนเงื่อนไขพิเศษ

### 4. การแช่แข็ง (ตอบข้อ "ไม่ย้อนหลัง")

เพิ่มคีย์ `legal` เข้าไปใน `document_snapshot_json` ที่ freeze ตอน submit อยู่แล้ว
([action route:208](<../../src/app/api/(lead)/quotations/[id]/action/route.ts>))
เก็บเป็น**ข้อความที่เรนเดอร์เสร็จสมบูรณ์แล้ว** (ไล่เลข + แทนค่า placeholder เรียบร้อย)
พร้อม `term_set_id` ที่ใช้

- ไม่ต้องเพิ่มคอลัมน์ → **เฟส 0 ไม่มี migration**
- bump `QUOTATION_DOCUMENT_VERSION` จาก 4 เป็น 5
- PDF อ่านจาก snapshot ก่อนเสมอ ถ้าไม่มี (ใบ draft / ใบเก่าก่อนเฟส 0) จึงคำนวณสด

### 5. การแก้เฉพาะใบ

เก็บส่วนต่างใน `document_inputs_json.terms_overrides` (คอลัมน์ NVARCHAR(MAX) เดิม
ไม่ต้อง migration):

```json
{
  "term_set_id": 3,
  "disabled_line_ids": [12, 15],
  "edited": { "12": "ข้อความที่แก้เฉพาะใบนี้" },
  "added": [{ "section_id": 4, "body": "...", "after_line_id": 21 }]
}
```

บรรทัดที่ `is_locked = 1` ปิดไม่ได้และแก้ไม่ได้รายใบ (ใช้กับข้อกฎหมายที่ต้องมีทุกใบ)

## แบ่งเฟส

### เฟส 0 — แช่แข็งเงื่อนไขตอน submit (ทำก่อนเสมอ)

ทำแยกได้เลยและมีคุณค่าในตัวเอง ต่อให้ไม่ทำเฟสถัดไปก็ยังคุ้ม เพราะปิดช่องที่
"แก้ข้อความในโค้ดแล้วใบที่ลูกค้าเซ็นไปแล้วเปลี่ยนตาม"

- เพิ่ม `legal` เข้า `QuotationDocumentSnapshot` และคำนวณใน `buildQuotationDocumentSnapshot()`
- PDF route ใช้ `snapshot.legal` เมื่อมี แทนการเรียก `getQuotationLegalContent()` สด
- bump `QUOTATION_DOCUMENT_VERSION` 4 → 5
- **ไม่มี migration · ไม่มี UI เปลี่ยน**
- **ย้อนกลับ**: revert commit เดียว ใบที่ snapshot ไว้แล้วจะถูกคำนวณสดเหมือนเดิม

### เฟส 1 — ตาราง master + หน้าจัดการต้นแบบ

- migration สร้าง 3 ตาราง + seed จากข้อความปัจจุบันทั้ง 2 โปรไฟล์
  (strip เลขข้อนำหน้า และแปลง 6 บรรทัดที่มีตัวเลขวิ่งให้เป็น placeholder)
- `getQuotationLegalContent()` เปลี่ยนไปอ่านจากตาราง — คงลายเซ็นฟังก์ชันเดิมไว้
  เพื่อไม่ให้ PDF route ต้องแก้
- หน้าใหม่ `/quotation-terms/manage` โครงเดียวกับ
  [/packages/manage](<../../src/app/(app)/packages/manage/page.tsx>)
  - เลือกโปรไฟล์ (ติดตั้งใหม่ทั้งระบบ / ติดตั้งเพิ่ม)
  - ลาก-เรียงหัวข้อและบรรทัด · เพิ่ม/ลบ/ปิดชั่วคราว
  - แถบปุ่มแทรกค่า + พรีวิวผลจริง
  - ปุ่ม "เผยแพร่" พร้อมสรุปว่าจะเปลี่ยนอะไรบ้างก่อนยืนยัน
  - ประวัติเวอร์ชัน: ใครเผยแพร่เมื่อไหร่ ดูย้อนหลังได้
- สิทธิ์: `admin`, `sales`, `sales_sup`
- **ย้อนกลับ**: ตั้ง feature flag ให้ `getQuotationLegalContent()` กลับไปใช้ค่าคงที่ในโค้ด
  ตารางที่สร้างไว้ทิ้งไว้เฉย ๆ ได้ (ไม่ลบตามกติกา migration ของโปรเจกต์)

### เฟส 2 — แก้เงื่อนไขเฉพาะใบใน QuotationBuilder

- แทน textarea "เงื่อนไขเพิ่มเติม" ก้อนเดียว
  ([QuotationBuilder.tsx:2167](../../src/components/lead/detail/steps/QuotationBuilder.tsx))
  ด้วยรายการเงื่อนไขที่ติ๊กเปิด/ปิด แก้ถ้อยคำ และเพิ่มบรรทัดได้
- ยังต้องรองรับ `terms_text` เดิมของใบเก่าที่มีข้อมูลอยู่แล้ว (แสดงเป็นบรรทัดที่เพิ่มเอง)
- เตือนเมื่อเนื้อหายาวเกินโควตาบรรทัดของหน้า (ดูความเสี่ยงข้อ 3)
- **ย้อนกลับ**: ซ่อน UI ใหม่ กลับไปแสดง textarea เดิม ข้อมูล overrides ที่บันทึกไว้
  จะถูกมองข้าม ไม่ทำให้ใบเสีย

### เฟส 3 (ยังไม่ยืนยัน) — ผูกชุดเงื่อนไขกับ Package

ปัจจุบันเลือกโปรไฟล์ด้วยการเดาจาก `is_upgrade` / ชื่อขึ้นต้น `Scale up:` / มีแบตอย่างเดียว
([getQuotationTermsProfile](../../src/lib/quotation-terms.ts)) ซึ่งเปราะ
เฟสนี้จะเพิ่ม `packages.term_set_profile` ให้เลือกได้ตรง ๆ จาก Package Management
ยังไม่รวมในรอบนี้ รอประเมินหลังเฟส 2

## Migration

ตั้งชื่อแบบ timestamp ตาม [docs/team-workflow.md](../team-workflow.md) เพราะเลขรัน 179–180
ถูกจองโดย `release/sla-only` ที่ยังไม่ merge เข้า `main`

```
scripts/migrations/20260827-XXXX_quotation_terms_master.sql
```

- สร้าง 3 ตารางแบบ `IF OBJECT_ID(...) IS NULL`
- seed ชุด published ของทั้ง 2 โปรไฟล์จากข้อความปัจจุบัน
- เขียนให้รันซ้ำได้ · ไม่ลบคอลัมน์/ตารางเดิม · ไม่แตะ `terms_text` ที่มีข้อมูลอยู่

## ไฟล์ที่คาดว่าจะแตะ

| ไฟล์ | เฟส | ทำอะไร |
|---|---|---|
| [src/lib/quotation-document.ts](../../src/lib/quotation-document.ts) | 0 | เพิ่ม `legal` ใน snapshot, bump version |
| [quotation-pdf/[id]/route.ts](<../../src/app/api/(doc)/quotation-pdf/[id]/route.ts>) | 0, 2 | อ่าน legal จาก snapshot · ปรับการตัดหน้า |
| [src/lib/quotation-terms.ts](../../src/lib/quotation-terms.ts) | 1 | อ่านจากตาราง + เครื่องไล่เลข + แทนค่า placeholder |
| `src/lib/quotation-terms-repo.ts` (ใหม่) | 1 | query/บันทึกตาราง master |
| `src/app/api/(config)/quotation-terms/**` (ใหม่) | 1 | CRUD + เผยแพร่ |
| `src/app/(app)/quotation-terms/manage/page.tsx` (ใหม่) | 1 | หน้าจัดการต้นแบบ |
| [QuotationBuilder.tsx](../../src/components/lead/detail/steps/QuotationBuilder.tsx) | 2 | UI เงื่อนไขรายใบแทน textarea |
| [leads/[id]/quotations/route.ts](<../../src/app/api/(lead)/leads/[id]/quotations/route.ts>) · [quotations/[id]/route.ts](<../../src/app/api/(lead)/quotations/[id]/route.ts>) | 2 | รับ `terms_overrides` |

## การทดสอบ

- ต่อยอด [scripts/tests/quotation-terms.mjs](../../scripts/tests/quotation-terms.mjs) ที่ผ่านอยู่แล้ว
  - เลขข้อไล่ถูกทั้งกรณีเปิดและปิด O&M (ต้องได้ผลเท่าโค้ดเดิมเป๊ะ)
  - แทนค่า placeholder ครบ ไม่มี `{{...}}` หลุดออกไปที่ผลลัพธ์
  - `is_locked` ปิดไม่ได้จากการแก้รายใบ
- **เทียบ PDF ก่อน/หลังเฟส 1** ของใบจริงอย่างน้อย 4 ใบ: ติดตั้งใหม่+O&M ·
  ติดตั้งใหม่ไม่มี O&M · ติดตั้งเพิ่ม · ใบที่มีรายการเกิน 14 แถว
  ผลต้องเหมือนเดิมทุกตัวอักษร
- รันจริงที่ port 3000 + puppeteer ตามกติกาของโปรเจกต์ ไม่ใช่แค่ typecheck

## ความเสี่ยง

1. **PDF ตัดหน้าด้วย heuristic นับแถว** — เงื่อนไขที่ยาวได้อิสระจะทับเลขหน้า
   *รับมือ*: เฟส 1 คงพฤติกรรมเดิมไว้ทั้งหมด (ข้อความเท่าเดิม จำนวนบรรทัดเท่าเดิม)
   เฟส 2 เพิ่มตัวนับโควตาบรรทัดในหน้าแก้ไข + เตือนก่อนบันทึก
2. **seed แปลงข้อความผิด** — strip เลขข้อหรือแปลง placeholder พลาดแม้ตัวอักษรเดียว
   *รับมือ*: เทสเทียบ PDF ก่อน/หลังตามข้างบน ต้องตรงทุกตัวอักษรก่อน merge
3. **3 role แก้ต้นแบบพร้อมกัน** — คนหนึ่งเผยแพร่ทับงานอีกคน
   *รับมือ*: draft มีได้ profile ละ 1 ชุด · แสดงชื่อคนที่กำลังแก้ค้างอยู่ ·
   เก็บประวัติทุกเวอร์ชันให้ย้อนดูได้
4. **ใบที่ค้างสถานะ draft ตอนเผยแพร่เงื่อนไขใหม่** — จะได้เงื่อนไขชุดใหม่ตอน submit
   *รับมือ*: ตั้งใจให้เป็นแบบนี้ (ยังไม่ submit = ยังไม่ freeze) แต่ต้องเขียนบอกใน UI ให้ชัด

## สิ่งที่ไม่รวมในแผนนี้

- ไม่แตะงวดชำระเงิน (`payment_terms_json`) และ `quotation_payment_templates`
  — คนละเรื่องกับข้อความเงื่อนไข ถ้าจะรวมต้องแยกแผน
- ไม่แตะระบบอนุมัติและการแจ้งเตือน
- ไม่แตะ prod และไม่รัน migration บน `solardb` ตามข้อตกลงทีม
