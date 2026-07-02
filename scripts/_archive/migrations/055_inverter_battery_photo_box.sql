-- 055: Add photo_box column to lead_inverters + lead_batteries (matching
-- the panel column added in migration 054). Same format: JSON-encoded
-- "[ymin,xmin,ymax,xmax]" with Gemini 0-1000 normalized coords, so the
-- UI's PhotoBoxViewer renders a red rectangle on the device's serial
-- sticker exactly like it does for panels.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.lead_inverters') AND name = 'photo_box'
)
BEGIN
  ALTER TABLE dbo.lead_inverters ADD photo_box NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.lead_batteries') AND name = 'photo_box'
)
BEGIN
  ALTER TABLE dbo.lead_batteries ADD photo_box NVARCHAR(50) NULL;
END
GO
