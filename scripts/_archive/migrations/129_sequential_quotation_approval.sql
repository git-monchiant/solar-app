-- Sequential quotation approval: Sale -> Solar Sup -> Sale Sup.
-- Idempotent migration for SQL Server.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'solar_approved_by'
)
  ALTER TABLE dbo.quotations ADD solar_approved_by INT NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'solar_approved_at'
)
  ALTER TABLE dbo.quotations ADD solar_approved_at DATETIME2 NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'solar_approval_note'
)
  ALTER TABLE dbo.quotations ADD solar_approval_note NVARCHAR(1000) NULL;

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID('dbo.quotations')
    AND name = 'CK_quotations_status'
)
  ALTER TABLE dbo.quotations DROP CONSTRAINT CK_quotations_status;

-- Existing one-step approvals have already passed the former workflow, so
-- keep them in the final Sale Sup queue instead of forcing a new Solar review.
UPDATE dbo.quotations
SET status = 'pending_sales_sup'
WHERE status = 'pending_approval';

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
      'changes_required'
    )
  );
