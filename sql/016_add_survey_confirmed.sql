-- Track whether the survey appointment has been confirmed by the team/customer
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_confirmed')
BEGIN
  ALTER TABLE leads ADD survey_confirmed BIT NOT NULL CONSTRAINT DF_leads_survey_confirmed DEFAULT 0;
END
GO
