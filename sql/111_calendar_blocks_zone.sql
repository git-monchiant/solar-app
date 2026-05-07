-- Tag calendar_blocks ("other work") with the zone/team they belong to.
-- NULL = applies to every team (e.g. company-wide holiday).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.calendar_blocks') AND name = 'zone')
BEGIN
  ALTER TABLE dbo.calendar_blocks ADD zone NVARCHAR(50) NULL;
END
GO
