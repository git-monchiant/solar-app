-- เลข journey ของงานบริการ O&M — สาย 2000
-- (design: docs/plan/20260922-01-om-align-with-sales-concept.md ข้อ 3.1 · ผู้ใช้เคาะ 23 ก.ย. 69)
--
-- ทำไมต้องมี: ทั้งระบบนับงานจาก journey code ที่เดียว (badge การ์ด hub + เมนูซ้าย + แถบล่าง)
--   O&M มีขั้นครบอยู่แล้วแต่เก็บเป็นคำ (follow/pending/…) เครื่องนับจึงอ่านไม่ออก
--   การ์ด O&M เลยเป็นโมดูลเดียวที่ไม่มีตัวเลข
--
-- ★ ทำไมไม่มี ALTER TABLE: เลขสาย 2000 แมป 1:1 กับ om_bookings.status ตรงๆ
--   คำนวณในคิวรีด้วย CASE (src/lib/om/journey.ts) ถูกกว่าเก็บคอลัมน์ซ้ำที่ต้องคอย sync
--   ต่างจากฝั่งขายที่ journey ต้อง derive จากหลายฟิลด์ (วันที่/สลิป/อนุมัติ) จึงต้อง persist
--   ⇒ migration นี้เพิ่มแต่ "ป้ายชื่อ" ไม่แตะโครงสร้างตารางเลย
--
-- ★ 2100 (ติดตาม) ไม่ได้มาจาก om_bookings — แท็บติดตามคำนวณสดจาก om_houses
--   (วัดจริง 22 ก.ย.: ใบงาน 2 ใบ แต่บ้านถึงรอบล้าง 1,849 หลัง)
--   ถ้านับจากใบงานอย่างเดียว การ์ดจะขึ้นเลข 2 ซึ่งผิดหนักกว่าไม่มี badge

MERGE dbo.journey_steps AS t
USING (VALUES
  (2100, 0, N'ติดตาม'),              -- ถึงรอบล้าง ยังไม่มีใบงาน (คำนวณสดจาก om_houses)
  (2200, 0, N'ทำนัด'),               -- om_bookings.status = pending
  (2300, 0, N'รอ O&M'),              -- confirmed
  (2400, 0, N'เข้า O&M'),            -- progress
  (2500, 0, N'รอลูกค้ายืนยัน'),       -- checked
  (2600, 0, N'ปิดงาน'),              -- closed
  (2800, 0, N'ยกเลิกงานบริการ'),      -- cancelled
  (2900, 0, N'ลูกค้าไม่อยู่บ้าน')      -- no_show
) AS s(step_code, sub_code, label_th)
ON t.step_code = s.step_code AND t.sub_code = s.sub_code
WHEN MATCHED THEN UPDATE SET label_th = s.label_th
WHEN NOT MATCHED THEN INSERT (step_code, sub_code, label_th) VALUES (s.step_code, s.sub_code, s.label_th);
GO

-- index ช่วยท่อน B ของ /api/journey-summary (GROUP BY status) และหน้า list ทุกแท็บ
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_bookings_status_house')
  CREATE INDEX IX_om_bookings_status_house ON dbo.om_bookings(status) INCLUDE (house_id);
GO
