-- 058: leads.refer_external_id
--
-- External referrer id supplied by the inbound webform caller (a partner
-- system's referrer/agent code — external, NOT an FK into our tables). Stored
-- so referral attribution can be queried per lead.
--
-- Nullable with no default: existing rows become NULL, and the inbound API
-- leaves it NULL when the caller doesn't send the field — so a web form that
-- hasn't been updated keeps working with no error.
--
-- NOTE: deliberately no `USE <db>;` — the deploy tool selects the database via
-- --db=, and a USE here would silently redirect a dev run at prod.
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'refer_external_id'
)
BEGIN
  ALTER TABLE leads ADD refer_external_id NVARCHAR(50) NULL;
END
