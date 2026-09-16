# หยุด SLA "โทรติดตามลูกค้า" เมื่อติดต่อลูกค้าได้แล้ว

วันที่: 2026-08-21
สถานะ: done

## กติกาที่ผู้ใช้กำหนด

> ถ้า Lead ติดต่อได้แล้ว ไม่ต้องโทรติดตามแล้ว

`GRADE_PLAYBOOK` (`daily_follow_up` — "โทรติดตามลูกค้า" ทุก 24 ชม. วนซ้ำ ตามแผน
[20260820-03](20260820-03-all-grades-same-policy.md)) จึงต้องปิดตัวเองเมื่อมีการ
ติดต่อลูกค้าได้ ไม่ใช่เปิดรอบใหม่อย่างที่ `repeatFrom: 0` ทำอยู่

ผู้ใช้อธิบายโมเดลที่ต้องการไว้ชัดอีกชั้นว่า

> ติดต่อ Lead ครั้งแรก นับ SLA 1 วัน · ติดต่อได้ → ไม่ต้องติดตามครั้งที่ 1
> เป็นต้นไปแล้ว

ซึ่งตรงกับ `FIRST_CONTACT` → `CONTACT_RETRY` ที่มีอยู่แล้ว — ชื่อ task ของ
retry ladder ในฐานข้อมูลคือ "ติดตามลูกค้าครั้งที่ 1 (Day 3)" … "ครั้งที่ 4
(Day 30)" ตรงคำ และ `recordContactOutcome` ยกเลิก `CONTACT_RETRY` ที่เปิดอยู่
ทั้งหมดทันทีที่ผลเป็น `connected` อยู่แล้ว **โมเดลนี้จึงไม่มีช่องให้
`GRADE_PLAYBOOK` ยืน**

### สองจุดที่ตัวเลขปัจจุบันยังไม่ตรงกับคำอธิบาย

| หัวข้อ | ที่ผู้ใช้พูด | ที่ระบบทำอยู่ |
| --- | --- | --- |
| `FIRST_CONTACT` | 1 วัน | deadline ตามปฏิทิน ไม่ใช่ 24 ชม. — รับ 09:00-18:59 ครบกำหนด 23:59:59 วันเดียวกัน, รับ 19:00-08:59 ครบกำหนด 12:00 (ตามแผน [20260820-01](20260820-01-first-contact-calendar-deadline.md), migration 157) เคส Lead 841 จึงได้ 10 ชม. 42 นาที |
| ติดตามครั้งที่ 1 | — | ครบกำหนด Day 3 นับจากครั้งที่ติดต่อไม่ได้ครั้งแรก ไม่ใช่ Day 1 |

ผู้ใช้ยืนยันแล้วว่า **คงกติกาเดิมทั้งสองข้อ** ไม่แก้ในแผนนี้

## เหตุผล — กติกานี้ทำให้ policy ไม่เหลืองานให้ทำ

นาฬิกาเรือนนี้ถูกสร้างขึ้นหลังกำหนด Grade เสมอ และการกำหนด Grade เกิดหลัง
`FIRST_CONTACT` เสมอ แปลว่า **ทุกใบที่เปิดอยู่ตอนนี้ล้วนเป็นของ Lead ที่ติดต่อได้
ไปแล้ว** ตัวเลขบน `solardb_dev` (ตรวจ 2026-08-21) ยืนยันตรงนี้ทั้งหมด

| ตัวชี้วัด | ค่า |
| --- | --- |
| instance ที่ยังเปิด (v2) | 218 ใบ |
| ในจำนวนนั้นอยู่สถานะ `breached` | **218 ใบ (100%)** |
| อยู่สถานะ `active` / `warning` / `critical` | 0 ใบ |
| เคยปิดได้สำเร็จ (`completed`) ตั้งแต่เปิด policy | **0 ใบ** |
| เคยวนรอบที่ 2 (`cycle > 0`) | **0 ใบ** |
| `started_at` ตรงกับเวลาที่ติดต่อได้ครั้งล่าสุดพอดี | 210 / 218 ใบ |
| เกินกำหนดมาแล้วเกิน 8 วัน | 209 / 218 ใบ |
| v1 ที่ถูก supersede ทิ้งไปก่อนหน้า | 199 ใบ |

ถ้าใช้กติกาใหม่ตรงตัว 210 ใบนั้นต้องปิด ณ วินาทีเดียวกับที่มันเปิด — ได้แถว
"ใช้จริง 0 นาที" ที่ไม่บอกอะไรเลย ซึ่งเป็นอาการเดียวกับที่ใช้เป็นเหตุผลยกเลิก
`ASSIGN_OWNER` ในแผน [20260820-10](20260820-10-retire-assign-owner-sla.md)

ส่วนอีก 8 ใบที่ไม่มีประวัติติดต่อได้ แยกเป็นสองกลุ่ม

- Lead 462, 561, 703, 940 — `FIRST_CONTACT` ปิดแล้วด้วยหลักฐานนัดสำรวจ
  (`resolveFirstContactEvidence`) และเดินไปถึงขั้น order/survey แล้ว คือ
  ติดต่อได้จริง เพียงแต่ไม่มี activity ชนิดติดต่อ
- Lead 880, 892, 929, 936 — โทรแล้ว "ติดต่อไม่ได้ - ไม่รับสาย" 2-4 ครั้ง
  เป็นกลุ่มเดียวที่ยังต้องตามต่อจริง

กลุ่มหลังคือหน้าที่ของ `FIRST_CONTACT` + `CONTACT_RETRY` (D3/D5/D7/D30) ตามแผน
[20260817-01](20260817-01-sales-sla-management.md) อยู่แล้ว ไม่ใช่ของ playbook

**สรุป: หลังใส่กติกา "ติดต่อได้แล้วไม่ต้องตาม" `GRADE_PLAYBOOK` ไม่เหลือสถานะใด
ที่มันเป็นเจ้าของ** ติดต่อได้ → ปิด · ติดต่อไม่ได้ → เป็นของ retry ladder

## สิ่งที่แก้: ยกเลิก `GRADE_PLAYBOOK` ทั้งระบบ พร้อมอุดช่องโหว่ retry ladder

### 1. ถอน policy

| ไฟล์ | การแก้ |
| --- | --- |
| `src/lib/sla-rules.ts` | ตัด `UNIFIED_PLAYBOOK`, `GRADE_PLAYBOOKS`, `GradePlaybookStep` และ type `SalesGrade` ที่เหลือใช้เฉพาะ playbook |
| `src/lib/sla-service.ts` | ตัด `createGradePlaybookInstance`, `ensureGradePlaybookTask`, `advanceGradePlaybook` และจุดเรียกใน `syncOperationalSlas` / `recordContactOutcome` |
| `src/app/(app)/leads/[id]/page.tsx` | ตัด `GRADE_PLAYBOOK` / `GRADE_A_NEXT_ACTION` ออกจาก `SLA_STEP_BY_POLICY` และ `slaCodes` ของขั้น Pre-Survey |
| `src/lib/sla-service.ts` (ต่อ) | `processGradeChange` เหลือแค่บันทึก `lead_grade_history` — เปลี่ยน Grade ไม่ต้องมีนาฬิกาเรือนไหนขยับอีก |
| `scripts/tests/sla-rules.mjs` | เปลี่ยน assertion เดิมเป็นด่านกันของเก่ากลับมา: `GRADE_PLAYBOOKS` / `UNIFIED_PLAYBOOK` / `isSalesGrade` ต้องเป็น `undefined` |
| `scripts/migrations/166_retire_grade_playbook_sla.sql` | ปิด policy `GRADE_PLAYBOOK` (v1+v2) และ `GRADE_A_NEXT_ACTION`, ตั้งทุก instance เป็น `cancelled` พร้อมล้าง `breached_at` และ backfill retry ladder ให้ Lead ที่ยังไม่เคยติดต่อได้ |

Grade ยังทำงานเหมือนเดิมทุกอย่าง — ยังกำหนดได้ ยังเก็บ `lead_grade_history`
ยังใช้จัดลำดับความสำคัญและบทสนทนา เพียงแต่ไม่ผูกกับนาฬิกา SLA อีก

### 2. อุดช่องโหว่ที่โผล่หลังถอน

ตรวจพบว่า **`CONTACT_RETRY` ไม่มี instance เลยสักใบในทั้งฐานข้อมูล** และ Lead
ทั้ง 4 ที่ติดต่อไม่ได้จริง (880, 892, 929, 936) ก็ **ไม่มีแถว `FIRST_CONTACT`**
ด้วย เหลือ `GRADE_PLAYBOOK` เป็นนาฬิกาเดียวที่จับพวกเขาอยู่

สาเหตุไม่ใช่บั๊กของโค้ดที่รันอยู่ แต่เป็นช่องว่างของการ backfill: migration 149
สร้าง `FIRST_CONTACT` ให้เฉพาะ Lead ที่ **ยังไม่มี activity ติดต่อ** ตอนที่ SLA
engine ขึ้น (`NOT EXISTS ... activity_type IN ('call','visit',...)`) Lead กลุ่มนี้
โทรไปแล้วก่อนหน้านั้นจึงถูกข้าม และ `createRetrySchedule` ทำงานต่อจาก
`FIRST_CONTACT` ที่เปิดอยู่เท่านั้น จึงไม่มีอะไรสร้าง ladder ให้เลย
(Lead ที่สร้างผ่าน API ปกติได้ `FIRST_CONTACT` ตั้งแต่ตอนสร้าง — ดู
`/api/leads`, `/api/v1/inbound/website-lead`, gmail sync — เส้นทาง runtime
จึงไม่มีปัญหา)

migration 166 จึงลง ladder ให้ Lead ที่ยังอยู่ขั้น Pre-Survey, เคยโทรแล้ว
ติดต่อไม่ได้, ไม่เคยติดต่อได้, ไม่เคยมีนัดหมาย และไม่มี SLA ติดตามเปิดค้างอยู่
โดยยึด anchor ที่ครั้งแรกที่ติดต่อไม่ได้ ตรงกับที่ `createRetrySchedule` ทำ

**สร้างเฉพาะขั้นที่ยังไม่ถึงกำหนด** — policy ไม่ได้เฝ้า Lead กลุ่มนี้อยู่ในตอนนั้น
การย้อนไปแจกใบเกินกำหนดของ Day 3/5/7 เท่ากับตัดสินช่วงเวลาที่ไม่มีใครวัด
ด้วยเหตุผลเดียวกับที่ข้อ 1 ล้าง `breached_at` ทิ้ง

### 3. ผลบน Timeline ของ Lead 841 (เคสที่ผู้ใช้ยกมา)

- แถว "โทรติดตามลูกค้า · เกินกำหนด · ใช้จริง 32 วัน 20 ชม." หายไป
- ขั้น Pre-Survey เปลี่ยนจาก 6/7 เป็น 6/6 ครบขั้น
- ชิปสรุปเปลี่ยนจาก `ผ่าน 4 · เกิน 3` เป็น `ผ่าน 4 · เกิน 2`
  (เหลือ `SITE_SURVEY` เสร็จเกิน SLA และ `DEPOSIT_CLOSE` ที่ยังค้างจริง)

## ทางเลือกที่ไม่เลือก

| ทางเลือก | เหตุผลที่ไม่เอา |
| --- | --- |
| ตัดแค่ `repeatFrom` ให้ไม่วนซ้ำ | ยังเหลือแถว 0 นาที 210 ใบ และยังซ้อนกับ `DEPOSIT_CLOSE` ในช่วง proposal → มัดจำ |
| ให้ playbook ปิดเมื่อ Lead พ้นขั้น Pre-Survey | แก้อาการ 3 ใบที่หลุดไปขั้นอื่น แต่ไม่แก้ 180 ใบที่ยังอยู่ pre_survey และ breached ทั้งหมด |
| ย้าย playbook ไปเปิดเฉพาะ Lead ที่ติดต่อไม่ได้ | ได้ policy ที่ทำงานทับ `CONTACT_RETRY` แบบคำต่อคำ |

## ผลบน solardb_dev

- policy `GRADE_PLAYBOOK` v1 + v2 และ `GRADE_A_NEXT_ACTION` v1 → `is_active = 0`
- instance ทั้ง **417 ใบ** (218 breached + 199 superseded) → `cancelled`
  และไม่เหลือ `breached_at` สักใบ
- retry ladder ใหม่ 4 ใบ สถานะ `active` ทั้งหมด — Lead 880 / 892 / 929 / 936
  ได้ "ติดตามลูกค้าครั้งที่ 4 (Day 30)" ครบกำหนด 26 ส.ค. / 29 ส.ค. / 30 ส.ค. /
  2 ก.ย. ตามลำดับ (ขั้น Day 3/5/7 เลยกำหนดไปแล้ว จึงข้ามตามที่ออกแบบไว้)
  ทั้งสี่ Lead เหลือ SLA ที่เปิดอยู่ใบละ 1 รายการ ไม่มีใครหลุดจากการติดตาม
- Lead 841 เหลือ SLA ที่แสดงบน Timeline 7 แถว: `FIRST_CONTACT`,
  `ELECTRICITY_ASSESSMENT`, `BOOK_SURVEY`, `SITE_SURVEY`, `PROPOSAL_ROI`
  (ผ่าน 4 · เสร็จเกิน SLA 1) และ `DEPOSIT_CLOSE` ที่ยังค้างจริง — ตรงตามที่คาด
- SLA ที่เปิดค้างทั้งระบบลดจาก 458 เหลือ **236 ใบ** (−218 playbook, +4 retry)
- รันซ้ำ 3 รอบได้ผลเดิม

## การตรวจสอบ

- `npx tsc --noEmit` ผ่าน
- `npx eslint` ไฟล์ที่แก้ ไม่มี error (เหลือ warning เดิม 3 รายการใน `page.tsx`)
- `node scripts/tests/sla-rules.mjs` ผ่าน
- `npm run build` ผ่าน
- migration 166 บน `solardb_dev` รันซ้ำ 3 รอบได้ผลเดิม (idempotent)
- ยังไม่ deploy Production
