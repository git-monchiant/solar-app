-- Link a prospect to the lead it was converted into, so Seeker UI can stop
-- duplicate conversions and jump straight to the lead detail page instead.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'lead_id')
  ALTER TABLE prospects ADD lead_id INT NULL;
GO
