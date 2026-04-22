-- line_users becomes a pure LINE profile registry (display_name, picture_url,
-- line_user_id). The link "which lead/prospect uses this LINE" lives on
-- leads.line_id and prospects.line_id so a single LINE can be attached to many
-- records simultaneously.
--
-- Steps:
--   1. Add prospects.line_id
--   2. Backfill line_id from any existing line_users.lead_id / prospect_id rows
--   3. Drop the FK constraints + lead_id/prospect_id columns on line_users

-- 1. prospects.line_id
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'line_id')
  ALTER TABLE prospects ADD line_id NVARCHAR(100) NULL;
GO

-- 2a. Backfill prospects.line_id from line_users.prospect_id
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'prospect_id')
BEGIN
  UPDATE p SET line_id = lu.line_user_id
  FROM prospects p
  INNER JOIN line_users lu ON lu.prospect_id = p.id
  WHERE p.line_id IS NULL;
END
GO

-- 2b. Backfill leads.line_id from line_users.lead_id (in case PATCH sync ever missed)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'lead_id')
BEGIN
  UPDATE l SET line_id = lu.line_user_id
  FROM leads l
  INNER JOIN line_users lu ON lu.lead_id = l.id
  WHERE l.line_id IS NULL;
END
GO

-- 3. Drop FK constraints (dynamic — MSSQL auto-generates names)
DECLARE @fk NVARCHAR(200);

SELECT @fk = name FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID('line_users') AND referenced_object_id = OBJECT_ID('leads');
IF @fk IS NOT NULL EXEC('ALTER TABLE line_users DROP CONSTRAINT ' + @fk);

SELECT @fk = name FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID('line_users') AND referenced_object_id = OBJECT_ID('prospects');
IF @fk IS NOT NULL EXEC('ALTER TABLE line_users DROP CONSTRAINT ' + @fk);
GO

-- 4. Drop the columns
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'lead_id')
  ALTER TABLE line_users DROP COLUMN lead_id;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'prospect_id')
  ALTER TABLE line_users DROP COLUMN prospect_id;
GO
