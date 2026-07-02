-- 051: Add customer_group + customer_grade columns to leads.
--
-- New "top panel" classification on the Info tab:
--   * customer_group — กลุ่มลูกค้า (general / sena / sme)
--   * customer_grade — เกรดลูกค้า A-F (qualified score from the sales team)

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'customer_group'
)
BEGIN
  ALTER TABLE dbo.leads ADD customer_group NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'customer_grade'
)
BEGIN
  ALTER TABLE dbo.leads ADD customer_grade NVARCHAR(2) NULL;
END
GO
