-- ประเภทค่าสำรวจ — 'normal' (เก็บค่าสำรวจตามปกติ) หรือ 'free' (ฟรีค่าสำรวจ).
-- Enum-style column so the choice is explicit on the row; the UI checkbox on
-- the pre-survey payment screen flips it between the two values. App forces
-- pre_total_price = 0 and hides the pay-invoice button when 'free'.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'pre_survey_fee_type')
  ALTER TABLE dbo.leads
    ADD pre_survey_fee_type NVARCHAR(10) NOT NULL
      CONSTRAINT DF_leads_pre_survey_fee_type DEFAULT 'normal'
      CONSTRAINT CK_leads_pre_survey_fee_type CHECK (pre_survey_fee_type IN ('free','normal'));
GO
