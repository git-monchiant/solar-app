-- Sales records the best time to reach this prospect (e.g. "เย็น หลัง 18.00",
-- "เสาร์-อาทิตย์"). Free text so sales can note whatever fits.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'contact_time')
  ALTER TABLE prospects ADD contact_time NVARCHAR(100) NULL;
GO
