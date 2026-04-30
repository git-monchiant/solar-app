-- Email + The1 member number on prospects. Both are optional secondary
-- contact channels; storing them as proper columns (instead of stuffing into
-- `note`) avoids tripping the "ติดตาม" card status, which keys off any
-- non-empty note.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'email')
  ALTER TABLE prospects ADD email NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'the1_id')
  ALTER TABLE prospects ADD the1_id NVARCHAR(50) NULL;
