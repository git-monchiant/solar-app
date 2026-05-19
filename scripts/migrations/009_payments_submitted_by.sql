-- Track who/when submitted the slip (step 1 — sale). Existing `confirmed_by`
-- + `confirmed_at` columns already cover step 2 (accountant verify); these
-- new columns close the gap so timeline + reports don't have to scrape the
-- activity log to attribute step 1.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'submitted_by')
BEGIN
  ALTER TABLE payments ADD submitted_by INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'submitted_at')
BEGIN
  ALTER TABLE payments ADD submitted_at DATETIME NULL;
END
