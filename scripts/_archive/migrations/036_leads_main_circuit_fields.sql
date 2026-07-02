-- ระบบไฟเข้าบ้าน — main breaker amperage + main feed cable size.
-- Captured during survey alongside the MDB / breaker fields so the installer
-- knows what the existing main switch + feed look like before sizing the new
-- PV interconnect.
--
-- Both stored as NVARCHAR so the "อื่นๆ ระบุ" pattern can save `other:<text>`
-- alongside the canonical chip values (40/50/80/100 A, 16/25/35/50 sq.mm),
-- matching how survey_meter_size and survey_breaker_type already work.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_main_breaker_amp')
  ALTER TABLE dbo.leads ADD survey_main_breaker_amp NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_main_cable_sqmm')
  ALTER TABLE dbo.leads ADD survey_main_cable_sqmm NVARCHAR(50) NULL;
GO
