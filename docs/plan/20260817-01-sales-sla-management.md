# Sales SLA Management

## สถานะ

`done` — พัฒนาและทดสอบบน `solardb_dev` แล้ว; ยังไม่ deploy หรือเปลี่ยน Production

## ผลการพัฒนา (17 สิงหาคม 2026)

- เพิ่ม migration `149_sales_sla_engine.sql` แบบ additive และ idempotent
- เพิ่ม Policy/Instance/Event Audit และ Grade History โดยเก็บ policy version ทุก instance
- สร้าง First Contact SLA อัตโนมัติจาก Lead ใหม่ทุกช่องทาง พร้อม backfill Lead เปิดที่ยังไม่เคยติดต่อ
- ใช้ Contact Window ตามข้อสรุป: 09:00–ก่อน 19:00 ภายใน 23:59 วันเดียวกัน; 19:00–ก่อน 09:00 ภายใน 12:00 รอบถัดไป; นับทุกวันใน `Asia/Bangkok`
- แยก First Contact Attempt ออกจากผลการติดต่อ และสร้าง Contact Retry Day 3/5/7/30 จากความพยายามที่ไม่สำเร็จครั้งแรก
- เมื่อติดต่อสำเร็จหรือข้อมูลติดต่อผิด ระบบยกเลิก Retry ที่เหลือและล้าง `next_follow_up`
- การเปลี่ยนเป็น Grade A บังคับระบุ Buying Signal/เหตุผล, เก็บ audit, supersede งาน Grade A เดิม และสร้าง next action ตาม Pipeline ปัจจุบัน
- เพิ่ม SLA badge ใน Lead Card/Lead Detail และหน้า `/sla` สำหรับ Sales/Supervisor
- ปรับหน้า `/sla` ให้ใช้ Header, search, status tabs, typography, semantic badges, card และ responsive behavior ชุดเดียวกับหน้า Today/Lead Tracking พร้อมปุ่ม refresh และ loading/error/empty states
- แก้ auto-assignment ให้รับ Lead เฉพาะกรณียังไม่มี Owner ไม่แย่ง Owner เดิมเมื่อบันทึกกิจกรรม
- ผ่าน SLA unit test, TypeScript, targeted ESLint, production build และ integration test บน DEV; ลบ Lead ทดสอบแล้ว

### Backup และการย้อนกลับ

- Source/worktree: `C:\Project\_backups\Solar-V0\20260817-sales-sla-preimplementation`
- DEV DB: `leads_bak_20260817_142014` และ `lead_activities_bak_20260817_142014`
- การ rollback ก่อน Production: revert ไฟล์โค้ดจาก source backup; ตาราง SLA ใหม่สามารถลบได้หลังหยุดโค้ดใหม่ และคอลัมน์ activity ใหม่เป็น nullable จึงไม่กระทบข้อมูลเดิม
- ยังไม่มีการ apply migration หรือ deploy ไป `solardb`/Production

### ขอบเขตที่ยังรอ Business ยืนยัน

Operational SLA ข้ามทีม (Survey 3/7 วัน, Proposal 24/48 ชั่วโมง, Installation 7–14/15 วัน และนิยาม Close/Deposit) ยังไม่เปิดใช้เป็น timer เพื่อไม่ฝังกติกาที่ยังขัดกัน โดยโครงสร้าง policy รองรับการเพิ่มใน migration ถัดไป

## เป้าหมาย

สร้างระบบ SLA ที่เปลี่ยนมาตรฐานงานขายจากตารางอ้างอิงให้เป็นงานที่ระบบจับเวลา แจ้งเตือน ตรวจสอบย้อนหลัง และวัดผลได้ โดยแยกความรับผิดชอบของ Sales, Support, Solar, Accounting, Installation และ After Sales อย่างชัดเจน

## แนวคิดหลัก

ระบบใช้ข้อมูล 3 แกนซึ่งมีหน้าที่ต่างกันและไม่ควรรวมเป็นสถานะเดียว:

1. **Lead Source → Response Policy**: กำหนดความเร็วในการรับและติดต่อ Lead ครั้งแรก
2. **Customer Grade → Sales Playbook**: กำหนดวิธีและความถี่ในการติดตามหลังประเมิน A–F
3. **Pipeline Status → Operational Workflow**: บอกขั้นตอนจริงของงาน เช่น Survey, Proposal, Deposit และ Installation

Grade เป็นตัวสร้างงานถัดไป ไม่ใช่ Pipeline Status ใหม่

```text
Lead เข้า
  → SLA ชั้นที่ 1: Assign และ First Contact ตาม Lead Source
  → บันทึกผลและจัด Grade A–F
  → SLA ชั้นที่ 2: สร้าง Playbook ตาม Grade และสถานะปัจจุบัน
  → Survey → Proposal → Deposit → Installation → After Sales/Nurturing
```

## SLA ชั้นที่ 1: Lead Management

### ผลลัพธ์ที่ต้องการ

- Lead มี Owner
- มี First Contact ที่ตรวจสอบได้
- มีผลการติดต่อ
- Lead ที่ยังเปิดอยู่มี Grade หรือกำหนดเวลาประเมิน Grade
- มี next action และ `next_follow_up`

### Policy เริ่มต้น

| Lead Source | Target | Hard Breach ที่เสนอ | Owner |
| --- | ---: | ---: | --- |
| Call In | รับทันที หรือโทรกลับใน 15 นาที | 30 นาทีหลัง Missed Call | Sales |
| LINE OA/Chat | ตอบใน 15 นาที | 30 นาที | Sales/Support |
| Website/Landing Page | โทรใน 15 นาทีหรือเวลาที่ลูกค้าระบุ | เกิน Contact Window | Sales |
| Facebook Lead Ads/Meta | โทรใน 15 นาทีหรือเวลาที่ลูกค้าระบุ | เกิน Contact Window | Sales |
| Google Search/SEM | โทรใน 15 นาที | เสนอ 1 ชั่วโมงแทน 24 ชั่วโมง เพราะ Intent สูง | Sales |
| Referral | โทรใน 15 นาที | 2 ชั่วโมง | Senior Sales |
| Event/Roadshow | ติดต่อใน 24 ชั่วโมง | 24 ชั่วโมง | Sales |

### กติกาการเริ่มและหยุดเวลา

- Assign Owner ทันทีด้วย Auto-assignment หรือภายใน 5 นาที
- First Contact เริ่มจากเวลารับ Lead ยกเว้นลูกค้าระบุ Contact Window
- ถ้าลูกค้าระบุเวลาติดต่อ ให้เริ่มนับจากเวลานั้น ไม่ถือเป็น Pause ทั่วไป
- First Contact สำเร็จเมื่อมี activity ของ Call, LINE, Chat หรือ SMS พร้อมผลการติดต่อ
- First Response SLA เดิมไม่เริ่มใหม่เมื่อ Lead เปลี่ยน Grade
- หากยังประเมิน Grade ไม่ได้ ต้องมี Grade Assessment deadline และ next follow-up

### ผลการติดต่อมาตรฐาน

- ติดต่อสำเร็จ
- ไม่รับสาย
- ขอให้ติดต่อภายหลัง
- ติดต่อผ่าน LINE/Chat แล้ว
- เบอร์ไม่ถูกต้อง
- ไม่สนใจ
- Duplicate Lead

### Contact Retry เมื่อยังติดต่อลูกค้าไม่ได้

ใช้วันของ Valid Contact Attempt ครั้งแรกที่ไม่สำเร็จเป็น `retry_anchor_date` และนับทุกกำหนดจากวันเดียวกันแบบ Calendar Day ใน timezone `Asia/Bangkok` รวมเสาร์ อาทิตย์ และวันหยุด:

| งาน | กำหนดสูงสุดจาก Anchor |
| --- | ---: |
| First Contact Attempt | ตาม Target/Hard Deadline ของ Lead แรกเข้า |
| Follow-up ครั้งที่ 1 | Day 3 |
| Follow-up ครั้งที่ 2 | Day 5 |
| Follow-up ครั้งที่ 3 | Day 7 |
| Follow-up ครั้งที่ 4 | Day 30 |

- กำหนดไม่เลื่อนสะสมจากวันที่ทำ Follow-up ก่อนหน้า แม้งานก่อนหน้าจะทำล่าช้า
- เมื่อติดต่อสำเร็จ ให้ cancel Retry Task ในอนาคตและเข้าสู่ Grade Assessment
- หากลูกค้าระบุวันติดต่อใหม่ ให้ใช้วันนัดลูกค้าและเก็บเหตุผล override
- เบอร์ผิด Duplicate Spam หรือปฏิเสธชัดเจนออกจาก Retry Flow ด้วย outcome ที่เหมาะสม
- หากครบ Follow-up ครั้งที่ 4 แล้วยังติดต่อไม่ได้ ให้เปลี่ยน Contact Status เป็น `unreachable`; ไม่จัดเป็น Grade F อัตโนมัติ

## SLA ชั้นที่ 2: Grade Playbook

### Grade A — พร้อมซื้อทันที

| Task | SLA | Trigger |
| --- | ---: | --- |
| แนะนำ/เก็บข้อมูล Pre-Survey | 24 ชั่วโมง | จัดเป็น Grade A |
| นัด Survey | 24 ชั่วโมง | ลูกค้าตกลงสำรวจ |
| ดำเนินการ Survey | 7 วัน | ลูกค้ายืนยันความพร้อม |
| ส่ง Proposal | 24 ชั่วโมง | Survey สมบูรณ์ |
| Follow-up ครั้งแรก | 1 วัน | ส่ง Proposal |
| สรุปผลการตัดสินใจ | 3 วัน | ส่ง Proposal |
| รับมัดจำ | เป้าหมาย 3 วัน | ลูกค้าตอบรับ Proposal |
| นัดติดตั้ง | 7 วัน | Accounting ยืนยันมัดจำ |
| ติดตั้ง | 15 วัน | ลูกค้าและอุปกรณ์พร้อม |
| ส่งมอบ | 7 วัน | ติดตั้งเสร็จ |
| Satisfaction Call | 3 วัน | ส่งมอบงาน |

แยก `Sale Accepted` ออกจาก `Deposit Confirmed` เพื่อแยกความล่าช้าของ Sales, ลูกค้า และ Accounting

### Grade B — กำลังเปรียบเทียบ

- ส่ง Company Profile, USP, Warranty, Reference Site ภายใน 24 ชั่วโมง
- นัด Review Call ภายใน 24 ชั่วโมง
- Follow-up Day 1, Day 7 และ Day 14
- ประเมินความสนใจใหม่ภายใน Day 15
- เก็บประเด็นเปรียบเทียบ เช่น ราคา อุปกรณ์ Warranty, ROI และคู่แข่ง

### Grade C — สนใจความคุ้มค่า

- ส่ง ROI/เอกสารคำนวณภายใน 24 ชั่วโมง
- เชิญ LINE OA ภายใน 24 ชั่วโมงเมื่อได้รับความยินยอม
- Follow-up ทุก 7 วัน
- Review ความต้องการทุก 14 วัน
- เก็บประเด็นติดขัด เช่น คืนทุน ขนาดระบบ Battery งบประมาณ และค่าไฟ

### Grade D — สนใจแต่ยังไม่พร้อม

- ส่ง FAQ/ข้อมูลเริ่มต้นภายใน 24 ชั่วโมง
- ส่งบทความหรือโปรโมชั่นเดือนละครั้ง
- ประเมินความสนใจใหม่ทุก 90 วัน
- ต้องมีเหตุผลที่ยังไม่พร้อมและช่วงเวลาที่คาดว่าจะพร้อม
- ถ้ามีเดือนเป้าหมาย ให้สร้าง Revisit ก่อนกำหนด 14–30 วันแทน cadence ตายตัว

### Grade E — หาข้อมูลทั่วไป

- ส่ง FAQ/ความรู้ภายใน 24 ชั่วโมง
- ส่งเนื้อหาความรู้เดือนละครั้งเมื่อได้รับความยินยอม
- ประเมินความสนใจทุก 90 วัน
- ไม่สร้าง Call Task ถี่โดยไม่มี Buying Signal

### Grade F — ไม่สนใจ

- ปิด Active Sales SLA พร้อมบันทึกเหตุผล
- เข้า Brand Nurturing เฉพาะผู้ยินยอมรับข่าวสาร
- Re-engagement ทุก 6 เดือน
- Archive หากไม่ตอบสนองภายใน 12 เดือน
- ถ้าลูกค้ากลับมา ให้เปิด Grade Upgrade/Lead Reactivation โดยไม่แก้ประวัติเดิม

## Grade Upgrade เป็น A

### Buying Signals

- ขอ Proposal หรือราคา
- ส่งบิลค่าไฟ/ข้อมูลบ้าน
- พร้อมนัด Survey
- ถามวันติดตั้ง
- เลือก Package แล้ว
- ยืนยันงบประมาณ
- ถามขั้นตอนมัดจำหรือชำระเงิน
- ต้องการติดตั้งภายใน 1–3 เดือน
- กลับมาติดต่อและแจ้งว่าพร้อมดำเนินการ

### กระบวนการ

1. ระบบตรวจ activity/คำตอบและแนะนำ Grade A หรือ Sale กดปรับเอง
2. Sale เลือกเหตุผล Buying Signal และยืนยัน next action
3. บันทึก `grade_changed` พร้อม Grade เดิม/ใหม่ ผู้เปลี่ยน เวลา และหมายเหตุ
4. ปิด task ของ Playbook เดิมเป็น `superseded` โดยไม่ลบประวัติ
5. สร้าง Grade A Playbook ตาม Pipeline Status ปัจจุบัน ไม่เริ่มใหม่จาก Pre-Survey เสมอไป
6. เริ่ม Grade A SLA จาก `grade_changed_at` และแจ้ง Owner
7. ถ้าไม่มี Owner ให้แจ้ง Sales Supervisor และ Assign ภายใน 5 นาที

ตัวอย่าง: Grade C ที่มี Proposal แล้วและพร้อมมัดจำ ต้องสร้างงานยืนยัน Package/ส่งข้อมูลชำระเงิน ไม่สร้าง Pre-Survey หรือ ROI ซ้ำ

### Grade Downgrade

- A → B เมื่อลูกค้ากลับไปเปรียบเทียบ
- A → C เมื่อติดเรื่อง ROI
- A → D เมื่อเลื่อนโครงการ
- A → F/Lost เมื่อปฏิเสธชัดเจน
- ต้องมีเหตุผลและไม่ลด Grade อัตโนมัติเพียงเพราะเกิน SLA

## Ownership และ Pause

SLA แต่ละรายการต้องระบุ Owner Role/Owner User และห้ามคิดความล่าช้าของทีมอื่นเป็นผลงาน Sale โดยตรง

เหตุผล Pause มาตรฐาน:

- รอลูกค้าส่งเอกสาร
- รอลูกค้ายืนยันวัน
- ลูกค้าขอเลื่อนนัด
- รอ Survey/Solar
- รออนุมัติ Proposal
- รอ Accounting
- รออุปกรณ์
- สภาพอากาศ
- รอหน่วยงานภายนอก

การ Pause ต้องมีเหตุผล ผู้ที่กำลังรอ วันที่คาดว่าจะดำเนินการต่อ และ next follow-up; Supervisor ต้องเห็นรายการ Pause นานผิดปกติ

## UX ที่เสนอ

### Today

- เกิน SLA
- ใกล้เกิน SLA
- ต้องทำวันนี้
- รอลูกค้าตอบ
- รอทีมอื่น
- นัดในอนาคต
- Grade A เร่งด่วน
- ไม่มี Owner/ไม่มี next action

Lead Card แสดง Source, Grade, Current SLA, Countdown, Owner และ Quick Actions

### Lead Detail

- Source SLA: ผลการตอบสนองครั้งแรก
- Current SLA Card: งานปัจจุบัน Deadline และปุ่มดำเนินการ
- Grade Playbook: งานที่เสร็จ งานปัจจุบัน และงานถัดไป
- Pipeline Journey: Survey, Proposal, Deposit, Installation และ After Sales
- Grade Change Timeline พร้อมเหตุผล

### Supervisor Dashboard

- Response SLA แยกตาม Source
- SLA Compliance แยกตาม Sale/ทีม
- Median First Response Time
- Follow-up On-time Rate
- Lead ไม่มี Owner/ไม่มี Next Action
- Stage Aging และ Pause Aging
- Grade Distribution และ Grade Movement
- Conversion แยก Source × Grade
- Grade Upgrade → A และเวลาจาก Buying Signal ถึง Next Action

## Escalation

| ระดับ | เงื่อนไข | การดำเนินการ |
| --- | --- | --- |
| Normal | ใช้เวลาไม่ถึง 75% | แสดงปกติ |
| Warning | ใช้เวลา 75% | แจ้ง Owner |
| Critical | ใช้เวลา 90% | แจ้ง Owner และ Supervisor |
| Breached | เกิน Deadline | สีแดงและอยู่บนสุดของ Today |
| Unowned | ไม่มี Owner เกิน 5 นาที | แจ้ง Supervisor |
| Stale | ไม่มี next action | แสดงเป็นข้อมูลไม่สมบูรณ์ |

SLA ระยะ 15 นาทีใช้การเตือนนาที 5, 10 และ 15 แทนเปอร์เซ็นต์อย่างเดียว

## แนวทางข้อมูล

### ใช้ข้อมูลเดิม

- `leads.source`
- `leads.customer_grade`
- `leads.assigned_user_id`
- `leads.status` / `stage_code`
- `leads.next_follow_up`
- `lead_activities`
- Lifecycle timestamps จาก Activity, Quotation และ Payment

### ข้อมูลใหม่ที่คาดว่าต้องมี

- SLA Policy: code, trigger, duration, business calendar, warning และ owner role
- SLA Instance ต่อ Lead: started/due/completed/breached/paused timestamps และ policy version
- SLA Event/Audit: create, pause, resume, complete, breach, supersede และ reassign
- Grade Change Audit: old/new grade, reason, buying signals, changed by/at
- Consent/Nurturing eligibility สำหรับ D–F

ควรเก็บ policy version ไว้กับ SLA Instance เพื่อให้แก้ Policy ในอนาคตโดยไม่เปลี่ยนผล SLA เก่า

## แผนดำเนินการ

### Phase 0 — Business Rules และ Baseline

- ยืนยันเวลาทำการ วันหยุด และ Calendar Day/Business Day
- ยืนยัน Target/Hard Breach ของแต่ละ Source โดยเฉพาะ SEM, Website และ Meta
- ยืนยัน Owner และ Handoff ของแต่ละขั้น
- ยืนยัน Pause reasons และผู้มีสิทธิ์ Pause/Resume
- วัด baseline จาก Lead เดิม: First Response, Follow-up และ Stage Aging
- สรุป Event Definition ที่ใช้ปิด SLA แต่ละประเภท

### Phase 1 — MVP: Response SLA

- Auto/quick assignment และ Unowned escalation
- First Contact SLA ตาม Lead Source/Contact Window
- ผลการติดต่อมาตรฐาน
- Countdown/สีเตือนใน Today และ Lead Card
- Activity/Audit และ Supervisor summary
- ยังไม่เปิด penalty; ใช้ช่วง calibration ก่อน

### Phase 2 — Grade Playbook และ Grade Upgrade

- Task generation สำหรับ A–F
- Grade Assessment deadline
- Grade Upgrade/Downgrade พร้อม Buying Signal และ Audit
- Supersede งานเดิมและสร้างงานใหม่ตามสถานะปัจจุบัน
- บังคับ next action สำหรับ Lead ที่ยังเปิด
- Consent gate สำหรับ nurturing

### Phase 3 — Cross-team Operational SLA

- Survey, Proposal, Deposit, Installation, Handover และ After Sales
- Ownership/Handoff ระหว่าง Sales, Solar, Accounting และ Installation
- Pause/Resume และ Dependency visibility
- Notification/Escalation ตาม Owner และ Supervisor

### Phase 4 — Dashboard และ Calibration

- Dashboard Source × Grade × Owner
- Drill-down จากตัวเลขไป Lead ต้นเหตุ
- วิเคราะห์ percentile/median แทนค่าเฉลี่ยอย่างเดียว
- ปรับ Target หลังเก็บข้อมูลจริง 1–2 เดือน
- เพิ่ม KPI โดยไม่ใช้จำนวน Activity เป็นคะแนนหลัก

## การตรวจสอบ

- Unit tests สำหรับ deadline, business hours, Contact Window, Pause/Resume และ policy version
- Integration tests สำหรับ trigger → instance → completion → escalation
- ทดสอบ Grade B–F → A ว่างานเดิมถูก supersede และไม่สร้างงานซ้ำ
- ทดสอบ Grade A ตามทุก Pipeline Status
- ทดสอบ Timezone Asia/Bangkok และวันหยุด
- ทดสอบสิทธิ์ Owner, Supervisor และทีมข้ามสายงาน
- UAT ด้วยสถานการณ์จริงจากทุก Lead Source
- เปรียบเทียบ Dashboard กับ Activity Audit และรายงาน Export

## Migration/Rollout

- เพิ่ม schema แบบ additive ไม่เปลี่ยน Activity เก่า
- Backfill เฉพาะข้อมูลที่อนุมานได้อย่างน่าเชื่อถือ และทำเครื่องหมายว่า derived
- เปิด Feature Flag ให้ทีมทดลองก่อน
- ช่วงแรกแสดง SLA เพื่อ coaching โดยยังไม่ผูกคะแนนหรือ penalty
- เปิดแจ้งเตือนทีละระดับเพื่อลด notification fatigue
- ขออนุญาตก่อน apply migration หรือ deploy ทุก environment

## ประเด็นรออนุมัติ

1. เวลาทำการและวันหยุดที่ใช้คำนวณ SLA
2. SEM ควร Hard Breach 1 ชั่วโมงหรือ 24 ชั่วโมง
3. Website/Meta ที่ไม่ระบุเวลาติดต่อใช้ Hard Breach เท่าใด
4. ใครเป็นผู้ Auto-assign และวิธีกระจาย Lead
5. Sale ปรับ Grade เองได้ทั้งหมดหรือบางกรณีต้อง Supervisor
6. เหตุผล Pause ใดที่ Sale กดเองได้
7. Grade A “ปิดการขาย 3 วัน” หมายถึง Sale Accepted หรือ Deposit Confirmed
8. ช่องทาง Nurturing และหลักฐาน consent ที่จะใช้
9. ขอบเขต MVP จะเริ่มเฉพาะ Response SLA หรือรวม Grade A Playbook

## Out of Scope ระยะแรก

- การคิดค่าปรับหรือ Commission จาก SLA
- AI เปลี่ยน Grade อัตโนมัติโดยไม่ให้ Sale ยืนยัน
- Marketing automation เต็มรูปแบบ
- SLA ของหน่วยงานภายนอกที่ควบคุมไม่ได้
- การ deploy หรือเปลี่ยน Production ก่อนผ่าน UAT และได้รับอนุญาต
