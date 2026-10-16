-- BOQ หมวด 13 O&M คำนวณจากช่องตั้งค่าแบบไฟล์ Excel (แผน docs/plan/20261016-03-b2b-boq-om-calculator.md)
--   b2b_materials.om_role = บรรทัดสูตร O&M (travel · lodging · allowance · contractor_km · contractor_lead · contractor_worker ·
--                            buffer_km · buffer_staff · tools · report) — จำนวนในใบ BOQ คิดจากช่องตั้งค่า (src/lib/b2b/om.ts)
--                            ราคาต่อหน่วยยังเป็นของ Purchase ตามปกติ · role เดียวกันเปิดใช้ได้ทีละรายการ
--   b2b_boqs.om_params    = ช่องตั้งค่า O&M ของใบ (JSON) · NULL = ใบที่ยังไม่ใช้สูตร
-- เพิ่มคอลัมน์อย่างเดียว · รันซ้ำได้ · ข้อมูล Master ปรับด้วย scripts/tools/b2b_import_materials.mjs --om-master

IF COL_LENGTH('dbo.b2b_materials', 'om_role') IS NULL
  ALTER TABLE dbo.b2b_materials ADD om_role VARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_b2b_mat_om_role')
  CREATE UNIQUE INDEX UX_b2b_mat_om_role ON dbo.b2b_materials (om_role) WHERE om_role IS NOT NULL AND is_active = 1;
GO
IF COL_LENGTH('dbo.b2b_boqs', 'om_params') IS NULL
  ALTER TABLE dbo.b2b_boqs ADD om_params NVARCHAR(500) NULL;
GO
