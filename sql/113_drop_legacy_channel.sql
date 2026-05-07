-- Drop the legacy channel/channels columns now that prospect_source + tag
-- own the model. All readers were updated in the same release.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'channels')
BEGIN
  ALTER TABLE dbo.prospects DROP COLUMN channels;
END
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'channel')
BEGIN
  ALTER TABLE dbo.prospects DROP COLUMN channel;
END
GO
