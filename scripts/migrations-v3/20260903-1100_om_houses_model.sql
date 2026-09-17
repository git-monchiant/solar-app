-- แบบบ้าน + เนื้อที่โฉนด จาก REM (om_rem_units) — ใช้ประเมินขนาดงานล้างแผง/พื้นที่หลังคา
IF COL_LENGTH('dbo.om_houses','model_name') IS NULL
  ALTER TABLE dbo.om_houses ADD model_name NVARCHAR(200) NULL, titledeed_area DECIMAL(12,2) NULL;
GO
