-- Add tag (additional touchpoints) to leads — mirrors prospects.tag.
-- `source` stays as the immutable first-touch (set on create, never updated);
-- `tag` is the editable JSON array of additional channels touched along the
-- journey (e.g. customer first found us via Ads, later came to an Event).
USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'tag'
)
BEGIN
  ALTER TABLE leads ADD tag NVARCHAR(500) NULL;
END
GO

-- Backfill from prospects: any lead linked to a prospect inherits the
-- prospect's tag (if not already set). One-time migration; future seeker→lead
-- promotions copy this on insert.
UPDATE l
SET l.tag = p.tag
FROM leads l
INNER JOIN prospects p ON p.lead_id = l.id
WHERE l.tag IS NULL AND p.tag IS NOT NULL;
GO

PRINT 'leads.tag added + backfilled from prospects';
GO
