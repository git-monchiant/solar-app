-- Multi-channel tags per prospect. Same person can be touched via multiple
-- channels over time (e.g. seen via senxpm canvassing, then registered at
-- an event). channels stored as JSON array string for portability.
-- Legacy `channel` column is kept in sync with channels[0] for back-compat.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'channels')
BEGIN
  ALTER TABLE dbo.prospects ADD channels NVARCHAR(500) NULL;
END
GO

-- Backfill: copy existing single channel into the new JSON array column.
UPDATE dbo.prospects
SET channels = CONCAT(N'["', channel, N'"]')
WHERE channel IS NOT NULL AND LEN(LTRIM(RTRIM(channel))) > 0
  AND (channels IS NULL OR channels = N'');
GO
