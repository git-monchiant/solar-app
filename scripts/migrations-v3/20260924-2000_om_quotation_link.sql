-- ใบเสนอราคางานบริการ O&M ผูกกับ lead เจ้าของบ้าน (แผน docs/plan/20260924-02 เฟส 2 · ผู้ใช้เคาะ 24 ก.ย. 69)
--
-- ① leads.om_only — lead ที่ระบบ O&M สร้างให้เจ้าของบ้านตอนออกใบเสนอราคาครั้งแรก
--    (บ้าน O&M 1,828 หลัง มี lead ขายแค่ 5 หลัง — ที่เหลือมาจาก REM ไม่เคยผ่านระบบขาย)
--    ฝั่งขายกรอง om_only = 1 ออกจาก pipeline / Today / dashboard / badge / SLA / BI
--    ★ ไม่ใช้ customer_type เพราะ Sale แก้ได้จากฟอร์ม lead และมีค่าเก่า 'o_and_m' ค้างอยู่ 1 แถว
--    ★ NOT NULL DEFAULT 0 — โค้ด v2 ที่ INSERT leads โดยไม่รู้จักคอลัมน์นี้ยังได้ 0 ตามเดิม
--      (กติกา README: ห้ามลบ/เปลี่ยนชนิด · เพิ่มคอลัมน์ที่มีค่า default ย้อนโค้ดกลับ v2 ได้)
--    ★ lead ขายเดิมของ 5 หลังนั้นยังเป็น om_only = 0 — เป็นลูกค้าขายจริง ต้องเห็นในฝั่งขายเหมือนเดิม
--
-- ② quotations.om_booking_id — ใบนี้เป็นงาน O&M ของใบงานไหน (NULL = ใบของฝั่งขาย)
--    ฝั่งขายกรองใบที่ไม่ NULL ออกจากรายการใบเสนอราคาของ lead (กัน 5 หลังที่ใช้ lead ร่วมกัน)
--
-- ③ ป้ายขั้นย่อยของเสนอราคา 2210–2250 (อ่านจากสถานะใบเสนอราคา ดู src/lib/om/journey.ts)

IF COL_LENGTH('dbo.leads', 'om_only') IS NULL
  ALTER TABLE dbo.leads ADD om_only BIT NOT NULL CONSTRAINT DF_leads_om_only DEFAULT 0;
GO

IF COL_LENGTH('dbo.quotations', 'om_booking_id') IS NULL
  ALTER TABLE dbo.quotations ADD om_booking_id INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_quotations_om_booking' AND object_id = OBJECT_ID('dbo.quotations'))
  CREATE INDEX IX_quotations_om_booking ON dbo.quotations(om_booking_id) WHERE om_booking_id IS NOT NULL;
GO

MERGE dbo.journey_steps AS t
USING (VALUES
  (2200, 2210, N'ร่างใบเสนอราคา'),       -- quotations.status = draft
  (2200, 2220, N'รอ Solar Sup อนุมัติ'),  -- pending_solar_sup
  (2200, 2230, N'รอ Sale Sup อนุมัติ'),   -- pending_sales_sup (+ pending_approval รุ่นเก่า)
  (2200, 2240, N'ส่งกลับแก้'),            -- changes_required
  (2200, 2250, N'อนุมัติแล้ว')            -- approved
) AS s(step_code, sub_code, label_th)
ON t.step_code = s.step_code AND t.sub_code = s.sub_code
WHEN MATCHED THEN UPDATE SET label_th = s.label_th, active = 1
WHEN NOT MATCHED THEN INSERT (step_code, sub_code, label_th) VALUES (s.step_code, s.sub_code, s.label_th);
GO
