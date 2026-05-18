-- Customize-tab item list for the survey step (e.g. "แผง 10", "แบต 1",
-- "Inverter 1", plus any free-form custom rows the user adds). Stored as
-- a JSON array of {name, count} objects so the column can grow with the
-- user's ad-hoc additions without schema churn.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_customize_items')
BEGIN
  ALTER TABLE leads ADD survey_customize_items NVARCHAR(MAX) NULL;
END
