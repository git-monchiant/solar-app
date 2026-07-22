-- 057: leads.warranty_no_inverter
--
-- Marks a job where the inverter was NOT installed by us — the customer already
-- had one, or another contractor supplied it. The warranty step then disables
-- every inverter field and stops requiring Serial Number / Phase, which used to
-- block issuing the warranty on these jobs.
--
-- NOTE: deliberately no `USE <db>;` — the deploy tool picks the database from
-- --db=, and a USE here would silently redirect a dev run at prod.
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'warranty_no_inverter'
)
BEGIN
  ALTER TABLE leads ADD warranty_no_inverter BIT NOT NULL CONSTRAINT DF_leads_warranty_no_inverter DEFAULT 0;
END
