# Timeline: ตัดกล่อง "การเดินสถานะ" และให้ rollback ขึ้นเฉพาะตอนที่ยังอธิบายอะไรอยู่

วันที่: 2026-08-20
สถานะ: done

## ปัญหา

แผน [15](20260820-15-install-stage-grouped-under-sla.md) พับการย้อนขั้นไว้ใน
กล่อง "การเดินสถานะ" ท้ายขั้น Install / Warranty พอใช้จริงแล้วกล่องนี้มีปัญหา
สามข้อ

1. **ไม่สม่ำเสมอ** — กล่องมีเฉพาะสองขั้นที่อยู่ใน `GROUPED_SLA_SECTIONS`
   ส่วนอีกห้าขั้น (Pre-Survey, Survey, Quotation, Order, Grid) rollback
   ยังโผล่เป็นแถวปกติบนเส้น timeline เพราะ `stageFlowRows` คำนวณเฉพาะ
   grouped stage คนดูจึงเห็นเรื่องเดียวกันคนละหน้าตาแล้วแต่ขั้น

2. **ส่วนใหญ่ไม่ได้อธิบายอะไร** — Lead 691 ย้อนกลับขั้น Install วันที่
   11 ก.ค. 10:39 แต่ SLA `INSTALLATION` ปิดไปแล้วตั้งแต่ 10 ก.ค. และยังอ่านว่า
   "เสร็จใน SLA" อยู่ กล่องจึงวางท้ายขั้นโดยไม่มีบรรทัดไหนข้างบนให้อธิบาย
   note ที่มีก็คือ "Manual rollback via admin" ซึ่งไม่ได้เพิ่มข้อมูล

3. **ซ้ำกับ Activity Log** — [ActivityTimeline.tsx](../../src/components/lead/detail/ActivityTimeline.tsx)
   ไม่ filter อะไรเลย ส่ง activity มาเท่าไรแสดงหมด ทุก rollback อยู่ครบใน
   panel ขวาอยู่แล้ว

## ข้อยกเว้นที่ต้องกันไว้

rollback ทำให้ SLA **reopen** ได้จริง — [sla-service.ts:114-118](../../src/lib/sla-service.ts#L114-L118)
ยอมให้ recalculate เมื่อ `completionAt` หายไป และ [บรรทัด 243](../../src/lib/sla-service.ts#L243)
เขียน event `reopened` ให้ instance เดิม ผลคือ `completed_at` ถูกล้างแล้วเริ่ม
นับใหม่

ถ้าย้อนแล้วทีมยังไม่เดินกลับมาปิด แถว SLA จะพลิกจาก "เสร็จใน SLA" กลับไปวิ่ง
หรือเกินกำหนด และถ้าลบ rollback ทิ้งหมด จะไม่มีอะไรบนหน้า Workflow บอกว่า
ทำไมนาฬิกาถึงกลับมาเดิน

## กติกาใหม่

แถว rollback แสดงเมื่อ **ขั้นนั้นยังมี SLA ที่ไม่ปิด** เท่านั้น

```
stageExplainsRollback = ขั้นนั้นไม่มี SLA เลย
                      || มี SLA อย่างน้อยหนึ่งใบที่ยังไม่ finished
```

- ขั้นที่ SLA ปิดครบแล้ว → ไม่แสดง rollback (ไปดูที่ Activity Log)
- ขั้นที่ยังมี SLA ค้าง → แสดงเป็น **แถวปกติบนเส้น** ตรงตำแหน่งเวลาของมัน
  พร้อม note และชื่อผู้ทำ ไม่ใช่กล่องพับ เพราะมันคือคำตอบว่าทำไม SLA
  ข้างบนถึงกลับมาวิ่ง — ซ่อนไว้หลังปุ่มคือเอาคำตอบไปวางไกลจากคำถาม
- ขั้นที่ไม่มี SLA เลย (Grid-Tie, ยกเลิก) → ยังแสดง เพราะไม่มีแถวอื่นเล่าแทน

กติกานี้ใช้ทุกขั้นเหมือนกัน จบปัญหาข้อ 1 ไปด้วย ส่วนแถว "เข้าสู่ขั้น X"
คงเดิมตามแผน 15 คือหายไปใน grouped stage และยังแสดงในขั้นที่เหลือ

## โค้ดที่แก้

ทั้งหมดอยู่ใน [src/app/(app)/leads/[id]/page.tsx](<../../src/app/(app)/leads/[id]/page.tsx>)

- เพิ่ม `stageExplainsRollback` และ `hiddenStatusFlow(row)` แทน `foldedIntoSlaNote`
  ตัวเดิม — ตัวเดิมนับ x/y ที่หัวขั้นผิดด้วย เพราะเช็ค `slaGroup` ตรงกับ SLA
  ของขั้น ทั้งที่ตอน render กรอง `!m.row.statusFlow` ล้วน ๆ แถว statusFlow ที่
  `slaGroup` ไม่ตรงจึงหายจากจอแต่ยังถูกนับ
- `children` / `ungroupedMilestones` ใช้ `hiddenStatusFlow` แทน `!m.row.statusFlow`
  → rollback ที่ผ่านเงื่อนไขไหลกลับเข้าเส้น timeline ตามลำดับเวลาเดิม
- ขั้นที่ไม่ group ใช้ `flatItems` (= `shownItems` ลบ rollback ที่ไม่ผ่านเงื่อนไข)
- ลบ `stageFlowRows` / `stageGroups` และ label "การเดินสถานะ" ทิ้ง ท้ายขั้นเหลือ
  กลุ่มพับสองแบบเดิมคือ "การแก้ไขนัดหมาย" และ "บันทึกการติดต่อ"

ไม่มี migration ไม่แตะ DB ไม่แตะ Activity Log

## ตรวจแล้ว

- `npx tsc --noEmit` ผ่าน
- `npm run lint` — ไฟล์ที่แก้เหลือแต่ warning เดิม (`Dropdown`/`InfoLine` unused,
  `<img>`) ไม่มี error ใหม่
