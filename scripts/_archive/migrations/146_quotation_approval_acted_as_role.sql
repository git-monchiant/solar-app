SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.quotation_approval_events', 'acted_as_role') IS NULL
BEGIN
  ALTER TABLE dbo.quotation_approval_events
    ADD acted_as_role NVARCHAR(30) NULL;
END;

COMMIT TRANSACTION;
