-- PDF §7 — recommended install size (3/5/7/10 kW). Survey team picks one
-- after walking the site; informs package selection below it.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_recommended_kw')
  ALTER TABLE leads ADD survey_recommended_kw DECIMAL(5, 1) NULL;
GO
