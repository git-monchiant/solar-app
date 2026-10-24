-- เรียงเลข journey ของงานบริการ O&M ใหม่ทั้งสาย + ป้ายชื่อชุดเดียว
-- (แผน docs/plan/20260924-02-om-quotation-approval-flow.md เฟส 1 · ผู้ใช้เคาะ 24 ก.ย. 69)
--
-- ทำไม: เพิ่มขั้นเสนอราคา/ชำระเงินของงานเสียเงิน ต้องแทรกระหว่างติดตามกับนัดหมาย
--   เลขเดิม 2200–2600 จองให้ ทำนัด/รอ O&M/เข้า O&M/รอลูกค้ายืนยัน/ปิดงาน ไว้แล้ว → เรียงใหม่ให้ตรงลำดับจริง
--   และเปลี่ยนป้ายให้ตรงกับทุกหน้าจอ (เดิมสถานะเดียวมี 3 ชื่อ)
--
-- ★ ไม่มีข้อมูลต้องย้าย — เลขสาย 2000 ไม่ได้เก็บในตารางไหน คำนวณจาก om_bookings.status
--   ด้วย CASE ใน src/lib/om/journey.ts (ดู 20260923-1000_om_journey_codes.sql)
--   ⇒ ไฟล์นี้แก้แค่ "ป้าย" ใน journey_steps · MERGE ทับแถวเดิมที่เลขซ้ำ รันซ้ำได้
--
--   เดิม                         ใหม่
--   2200 ทำนัด (pending)       → 2400 นัดหมาย · sub 2410 รอยืนยันนัด
--   2300 รอ O&M (confirmed)    → 2400 นัดหมาย · sub 2420 นัดแล้ว
--   2400 เข้า O&M (progress)   → 2500 เข้างาน
--   2500 รอลูกค้ายืนยัน (checked) → 2600 รอปิด
--   2600 ปิดงาน (closed)       → 2700 ปิดงาน
--   2200 / 2300 ว่างไว้ให้ เสนอราคา / ชำระเงิน (เฟส 2–4 ยังไม่มีใบงานอยู่ขั้นนี้)

MERGE dbo.journey_steps AS t
USING (VALUES
  (2100, 0,    N'ติดตาม'),
  (2200, 0,    N'เสนอราคา'),
  (2300, 0,    N'ชำระเงิน'),
  (2400, 0,    N'นัดหมาย'),
  (2400, 2410, N'รอยืนยันนัด'),         -- om_bookings.status = pending
  (2400, 2420, N'นัดแล้ว'),             -- confirmed
  (2500, 0,    N'เข้างาน'),             -- progress
  (2600, 0,    N'รอปิด'),               -- checked
  (2700, 0,    N'ปิดงาน'),              -- closed
  (2800, 0,    N'ยกเลิกงานบริการ'),      -- cancelled
  (2900, 0,    N'ลูกค้าไม่อยู่บ้าน')      -- no_show
) AS s(step_code, sub_code, label_th)
ON t.step_code = s.step_code AND t.sub_code = s.sub_code
WHEN MATCHED THEN UPDATE SET label_th = s.label_th, active = 1
WHEN NOT MATCHED THEN INSERT (step_code, sub_code, label_th) VALUES (s.step_code, s.sub_code, s.label_th);
GO
