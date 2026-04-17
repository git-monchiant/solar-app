USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'visit_count'
)
BEGIN
  ALTER TABLE prospects ADD visit_count INT NOT NULL DEFAULT 0;
END
GO

-- Backfill: records with visited_at set had at least 1 visit
UPDATE prospects SET visit_count = 1 WHERE visited_at IS NOT NULL AND visit_count = 0;
GO
