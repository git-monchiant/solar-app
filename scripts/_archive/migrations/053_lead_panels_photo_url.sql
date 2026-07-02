-- 053: Add photo_url column to lead_panels so each panel row can carry
-- its OCR snapshot URL, matching what lead_inverters and lead_batteries
-- already do. Without this column the equipment-serial tree can't show
-- the panel photo even though the modal captures it.
--
-- Multi-SN photos (one sheet → N serials) share the same photo_url
-- across all the rows extracted from that sheet.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.lead_panels') AND name = 'photo_url'
)
BEGIN
  ALTER TABLE dbo.lead_panels ADD photo_url NVARCHAR(500) NULL;
END
GO
