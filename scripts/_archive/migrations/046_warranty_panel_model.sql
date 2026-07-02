-- 046: Add warranty_panel_model column to leads.
--
-- Warranty subStep 0 PANEL section now mirrors InstallChecklist §1.3 layout
-- (ยี่ห้อ Dropdown + รุ่น + จำนวน + วัตต์ + kWp). The model field needs its
-- own column on leads — the others (brand/count/watt/kwp) already exist.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_panel_model'
)
BEGIN
  ALTER TABLE dbo.leads ADD warranty_panel_model NVARCHAR(200) NULL;
END
GO
