# ทุก Grade ใช้ SLA Policy ชุดเดียวกับ Grade A

วันที่: 2026-08-20
สถานะ: done

## เงื่อนไขใหม่

Grade ไม่เป็นตัวกำหนดนาฬิกา SLA อีกต่อไป — ใช้เป็นลำดับความสำคัญและแนวทางการคุยเท่านั้น

### 1. Operational SLA เปิดให้ทุกเกรด

เดิม `BOOK_SURVEY` · `SITE_SURVEY` · `PROPOSAL_ROI` · `DEPOSIT_CLOSE` · `CLOSE_LEAD`
เปิดเฉพาะ Grade A ตอนนี้เปิดกับ Lead ทุกเกรดที่มี anchor ครบ ระยะเวลาและ anchor เท่าเดิม

| Policy | เดิม | ใหม่ |
| --- | --- | --- |
| `BOOK_SURVEY` v3 | Grade A เท่านั้น | ทุกเกรด · 24 ชม. จากเวลาที่กำหนด Grade |
| `SITE_SURVEY` v3 | Grade A เท่านั้น | ทุกเกรด · 7 วัน จากวัน-เวลานัดจริง |
| `PROPOSAL_ROI` v3 | Grade A เท่านั้น | ทุกเกรด · 24 ชม. จากสำรวจเสร็จ |
| `DEPOSIT_CLOSE` v3 | Grade A เท่านั้น | ทุกเกรด · 3 วัน จากส่ง Proposal |
| `CLOSE_LEAD` v2 | Grade A เท่านั้น | ทุกเกรด · 7 วัน จากติดตั้งเสร็จ |

### 2. Grade Playbook รวมเป็นชุดเดียว

`GRADE_PLAYBOOK` v2 — ทุกเกรดใช้งานเดียวกันคือ **"โทรติดตามลูกค้า"** ครบกำหนด 24 ชม.
เตือนก่อน 4 ชม. วนซ้ำไม่สิ้นสุด เดินรอบใหม่ทุกครั้งที่บันทึกผล "ติดต่อได้"

Playbook เฉพาะเกรด B-F (ส่ง Company Profile, ROI, FAQ, บทความรายเดือน, Re-engagement,
ปิด Lead ที่ 365 วัน) ถูกยกเลิกทั้งหมด

## สิ่งที่แก้

- `src/lib/sla-rules.ts`
  - `GRADE_PLAYBOOKS` ทุกเกรดชี้ไปที่ `UNIFIED_PLAYBOOK` ชุดเดียว
  - ลบ `gradeATaskForStage()` ที่เป็น dead code ของ policy `GRADE_A_NEXT_ACTION` ที่เลิกใช้แล้ว
- `src/lib/sla-service.ts`
  - ตัดเงื่อนไข `isGradeA` ออกจาก 5 policy และ bump policy version
  - Playbook หยุดเมื่อรับมัดจำแล้วสำหรับทุกเกรด (เดิมเช็คเฉพาะ Grade A)
  - `instance_key` ของ playbook เปลี่ยนเป็น `grade-playbook:v2:...` เพื่อไม่ชนกับแถวเดิม
    (`UQ_lead_sla_instance_key`) และเพื่อให้ runtime สร้างงานใหม่ให้ Lead ที่ยังไม่มี
- `scripts/migrations/159_all_grades_same_policy.sql`
  1. ลงทะเบียน policy version ใหม่และปิด version เดิม
  2. คืนชีพ instance ที่ migration 156 ปิดไปด้วยเหตุผล `not_grade_a` โดยใช้ anchor เดิม
  3. ปิด playbook v1 ทั้งหมดแล้วสร้างงาน "โทรติดตามลูกค้า" ให้ Lead ที่เข้าเกณฑ์
     โดย anchor ที่ **การติดต่อได้ครั้งล่าสุด** (ถ้าไม่มีใช้เวลาที่กำหนด Grade)
     เพื่อไม่ให้ Lead ที่คุยกันอยู่กลายเป็นเกินกำหนดเพราะวันที่ให้เกรดนานแล้ว
- `scripts/tests/sla-rules.mjs` — ทดสอบว่าเกรด A-F ได้ playbook ชุดเดียวกัน

## ผลกระทบที่ต้องรู้ก่อน apply

- **จำนวน breach จะเพิ่มขึ้นมาก** Lead เกรด B-F ที่ยังไม่นัดสำรวจจะมี `BOOK_SURVEY` เกินกำหนด
  ทันทีที่คืนชีพ และงาน "โทรติดตามลูกค้า" จะ breach ทุก Lead ที่ไม่ได้คุยกันเกิน 24 ชม.
  ซึ่งเป็นผลตรงตามกติกาที่เลือก ไม่ใช่ข้อมูลผิด
- Grade F ในคู่มือระบุว่า "ปิดเคส ไม่ติดตามต่อ" แต่ตอนนี้จะได้งานโทรติดตามทุกวันเหมือนเกรดอื่น
  ถ้าไม่ต้องการให้ F เข้าเกณฑ์ ต้องเพิ่มเงื่อนไขยกเว้นภายหลัง
- Lead เกรดที่ไม่ใช่ A ซึ่งถูกสร้างหลัง migration 156 จะยังไม่มีแถว SLA ของ 5 policy นี้
  จนกว่าจะมีการเปิด/แก้ไข Lead นั้น เพราะ `syncOperationalSlas` ทำงานตอนอ่าน Lead

## ต่อยอด: กด Grade F แล้วปิด Lead เลย

Grade F แปลว่า "ไม่สนใจ — ปิดเคส ไม่ติดตามต่อ" และข้อมูลจริงบน solardb_dev ยืนยันว่า
ทีมปิดเป็น `lost` เองอยู่แล้ว (122 lost + 5 returned จาก 128 ราย เหลือค้างแค่ 1)
จึงต่อปุ่ม Grade F เข้ากับ flow ปิด Lead ที่มีอยู่แล้ว

- `src/app/(app)/leads/[id]/page.tsx` — หลังบันทึกเกรดสำเร็จ ถ้าเลือก `F` และ Lead
  ยังไม่ถูกปิด จะเปิด `LostModal` ต่อทันที
- `LostModal` เดิม PATCH `status: "lost"` + `lost_reason` → `syncOperationalSlas`
  ยกเลิก SLA ทุกใบและ supersede playbook ให้เอง ไม่ต้องแก้ API หรือ migration
- ถ้าผู้ใช้ปิด modal ทิ้ง เกรดยังเป็น F แต่ Lead ยังเปิดอยู่ (ไม่บังคับ) ปิดทีหลังได้
  จากปุ่มยกเลิก Lead เดิม

## บั๊กที่เจอระหว่าง apply บน solardb_dev

**migration 152 ปิด `DEPOSIT_CLOSE` ทิ้งทุกครั้งที่รัน** โดยเข้าใจว่า
`PAYMENT_INSTALLMENT_1` + `LOAN_PREAPPROVAL` มาแทน แต่สอง policy นั้นติดตาม
"วิธีชำระเงิน" ไม่ได้แทน "ปิดการขายและรับมัดจำ" — migration 156 ลงทะเบียน
`DEPOSIT_CLOSE` กลับมาแล้ว และ `sla-service` ก็ไม่เคยหยุดสร้าง SLA ตัวนี้

- ลบคำสั่ง supersede ออกจาก 152 (ยังไม่เคยขึ้น Production จึงแก้ได้)
- เพิ่มขั้นตอน 2b ใน 159 คืนชีพ 24 instance ที่ถูกปิดไปแล้วบน solardb_dev

อีกสองจุดที่แก้ระหว่างทดสอบ:

- 159 รอบแรก supersede playbook v2 ที่ตัวเองเพิ่งสร้าง ทำให้รันซ้ำแล้วงานหายทั้งหมด
  แก้เป็น supersede เฉพาะ `policy_version < 2` และเพิ่มขั้นตอนซ่อม DB ที่รันฉบับแรกไปแล้ว
- migration 156 ประทับ `policy_version` ทับแถว Grade A ที่ยังเปิดอยู่ (วันครบกำหนดเท่ากัน
  แต่เลข version ไม่ตรง policy ที่ active) — เพิ่มขั้นตอน 4 ใน 159 normalize ให้ตรงกัน

## การตรวจสอบ

- `npm run test:sla` ผ่าน · `npx tsc --noEmit` ผ่าน · `npx eslint` ผ่าน
- apply migration 152-159 บน `solardb_dev` แล้ว และรันซ้ำ 3 รอบได้ผลเท่าเดิม (idempotent)
- ยังไม่ deploy Production

### ผลบน solardb_dev หลัง apply

| Policy | เปิดอยู่ก่อน | เปิดอยู่หลัง |
| --- | --- | --- |
| `BOOK_SURVEY` | 3 | 167 (คืนชีพ 164 · breached ทั้งหมด) |
| `SITE_SURVEY` | 2 | 6 |
| `DEPOSIT_CLOSE` | 1 | 24 (คืนชีพจากบั๊ก 152) |
| `CLOSE_LEAD` | 3 | 3 |
| `GRADE_PLAYBOOK` | 199 (v1 หลายชนิด) | 218 (v2 "โทรติดตามลูกค้า" ทั้งหมด) |
| รวม breached | 247 | 455 |

Playbook แยกตามเกรด: A 28 · B 27 · C 43 · D 22 · E 97 · F 1 — anchor เก่าสุด 66 วัน
จึง breached ทั้งหมด ซึ่งตรงตามกติกา "โทรติดตามทุก 24 ชม."

`task_name` ของแถวที่คืนชีพยังเป็นข้อความรุ่นเก่าจนกว่า `syncOperationalSlas`
จะเขียนทับตอนเปิด Lead ครั้งถัดไป
