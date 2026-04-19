-- Revert 062: confirmed flag is unnecessary because slip_files is staging only.
-- Once payment is confirmed, slip_files row is deleted and BLOB moves to payments.
-- The implicit rule is: row exists in slip_files = uploaded but not confirmed.

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_slip_files_confirmed')
  ALTER TABLE slip_files DROP CONSTRAINT DF_slip_files_confirmed;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('slip_files') AND name = 'confirmed')
  ALTER TABLE slip_files DROP COLUMN confirmed;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('slip_files') AND name = 'confirmed_at')
  ALTER TABLE slip_files DROP COLUMN confirmed_at;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('slip_files') AND name = 'confirmed_by')
  ALTER TABLE slip_files DROP COLUMN confirmed_by;
GO
