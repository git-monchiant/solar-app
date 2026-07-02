-- 054: Add photo_box column to lead_panels — stores the bounding box of the
-- serial sticker on photo_url so the UI can draw a red overlay rectangle
-- pointing at exactly where this serial sits on the multi-panel sheet.
--
-- Format: JSON array "[y1,x1,y2,x2]" with Gemini-style 0-1000 normalized
-- coordinates (matches what gemini-2.5-flash returns natively).
-- 50 chars is enough for "[1000,1000,1000,1000]" + brackets/commas.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.lead_panels') AND name = 'photo_box'
)
BEGIN
  ALTER TABLE dbo.lead_panels ADD photo_box NVARCHAR(50) NULL;
END
GO
