-- Add an explicit "other" Package type.
-- Idempotent migration for SQL Server.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.packages') AND name = 'is_other'
)
  ALTER TABLE dbo.packages
    ADD is_other BIT NOT NULL
      CONSTRAINT DF_packages_is_other DEFAULT (0) WITH VALUES;
