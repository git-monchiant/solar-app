-- Rename existing columns instead of duplicating them. The 112 migration
-- created prospect_source + tag as new columns and backfilled — undo that
-- and rename the originals straight to the new names.

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_prospects_prospect_source')
BEGIN
  DROP INDEX ix_prospects_prospect_source ON dbo.prospects;
END
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'prospect_source')
BEGIN
  ALTER TABLE dbo.prospects DROP COLUMN prospect_source;
END
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'tag')
BEGIN
  ALTER TABLE dbo.prospects DROP COLUMN tag;
END
GO

-- Rename in place (data preserved). channel = first-touch source (immutable),
-- channels = additional tags JSON array.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'channel')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'prospect_source')
BEGIN
  EXEC sp_rename 'dbo.prospects.channel', 'prospect_source', 'COLUMN';
END
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'channels')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'tag')
BEGIN
  EXEC sp_rename 'dbo.prospects.channels', 'tag', 'COLUMN';
END
GO

-- Now that tag replaces the multi-channel store, strip the source from any
-- backfilled tag JSON so we don't double-count it.
UPDATE dbo.prospects
SET tag = NULL
WHERE tag IS NOT NULL
  AND tag = CONCAT(N'["', prospect_source, N'"]');
GO

CREATE INDEX ix_prospects_prospect_source ON dbo.prospects(prospect_source);
GO
