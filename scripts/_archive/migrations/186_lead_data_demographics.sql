-- Questionnaire §9 Customer Demographics — occupation / age / household income.
-- Kept as its own section instead of folding into §1 Customer Profile: §1 is
-- about the HOUSE (type, roof, age), these three are about the PERSON, and
-- household_income is sensitive enough to want its own block for future
-- role-based gating.
--
-- All three are single-choice codes; occupation also accepts the shared
-- "other:<free text>" pattern, hence the wider column.

IF COL_LENGTH('dbo.lead_data', 'occupation')        IS NULL ALTER TABLE dbo.lead_data ADD occupation        NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'age_range')         IS NULL ALTER TABLE dbo.lead_data ADD age_range         NVARCHAR(20)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'household_income')  IS NULL ALTER TABLE dbo.lead_data ADD household_income  NVARCHAR(20)  NULL;
GO
