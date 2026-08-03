-- Preserve cancelled quotation history while allowing a fresh quotation set.
-- Idempotent migration for SQL Server.

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID('dbo.quotations')
    AND name = 'CK_quotations_status'
)
  ALTER TABLE dbo.quotations DROP CONSTRAINT CK_quotations_status;

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID('dbo.quotations')
    AND name = 'CK_quotations_status'
)
  ALTER TABLE dbo.quotations ADD CONSTRAINT CK_quotations_status CHECK (
    status IN (
      'draft',
      'pending_solar_sup',
      'pending_sales_sup',
      'pending_approval',
      'approved',
      'changes_required',
      'cancelled'
    )
  );
