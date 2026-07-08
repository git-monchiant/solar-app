-- Inbound webform lead payload. Website (senasolarenergy.com) and future
-- 3rd-party form providers POST to /api/v1/inbound/website-lead. The 12
-- core fields land in leads/lead_data; the rest — UTM, Facebook Pixel,
-- Google gclid, IP/UA, consent audit, external entry_id — go here as a
-- JSON blob so nothing gets dropped.
--
-- MAX so we don't have to keep bumping the size as marketing adds trackers.
-- NO `USE solardb;` — deploy_migrations connects to the right DB via --db=.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'webform_meta'
)
BEGIN
  ALTER TABLE leads ADD webform_meta NVARCHAR(MAX) NULL;
END
GO

PRINT 'leads.webform_meta added';
GO
