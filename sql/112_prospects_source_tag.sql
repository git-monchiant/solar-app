-- Split the old channel/channels mash-up into two clearer columns:
--   prospect_source  = first touchpoint (immutable after creation)
--   tag              = JSON array of additional touchpoints, editable
-- Old `channel` and `channels` columns are kept in sync via app-level mirrors
-- until every reader is migrated; we'll drop them in a follow-up migration.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'prospect_source')
BEGIN
  ALTER TABLE dbo.prospects ADD prospect_source NVARCHAR(20) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'tag')
BEGIN
  ALTER TABLE dbo.prospects ADD tag NVARCHAR(500) NULL;
END
GO

-- Backfill source from legacy channel column.
UPDATE dbo.prospects
SET prospect_source = channel
WHERE prospect_source IS NULL AND channel IS NOT NULL AND LEN(LTRIM(RTRIM(channel))) > 0;
GO

-- Backfill tag from legacy channels JSON, but EXCLUDE the source so we don't
-- double-count the first touchpoint. After backfill, prospects whose only
-- channel was their source will have tag = NULL (which is what we want).
UPDATE p
SET tag = CASE
  WHEN p.channels IS NULL OR p.channels = N'' OR p.channels = N'[]' THEN NULL
  -- Common case: channels = ["X"] where X is the source → empty tag
  WHEN p.channels = CONCAT(N'["', p.prospect_source, N'"]') THEN NULL
  -- Otherwise keep the JSON as-is (the multi-touch backfill we did earlier);
  -- the API will strip the source from this array when reading.
  ELSE p.channels
END
FROM dbo.prospects p
WHERE p.tag IS NULL;
GO

-- Index for the most common report query: "how many prospects came via X first?"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_prospects_prospect_source')
BEGIN
  CREATE INDEX ix_prospects_prospect_source ON dbo.prospects(prospect_source);
END
GO
