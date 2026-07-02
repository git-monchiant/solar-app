-- Questionnaire Section 8 — Decision Making Factor.
--
-- 8 weighted factors stored as a single JSON column so we can evolve the
-- factor list without an ALTER TABLE for every new criterion. Same pattern
-- as ac_split in migration 040. Shape:
--   {
--     "company_reliable":   5,
--     "home_understanding": 4,
--     "equipment_standard": 5,
--     "engineer_design":    3,
--     "financial_advisor":  2,
--     "installment_loan":   4,
--     "affordable_price":   5,
--     "other":              { "score": 3, "text": "..." }
--   }
-- All scores are 1..5 (null = unrated).

IF COL_LENGTH('dbo.lead_data', 'decision_factors') IS NULL
  ALTER TABLE dbo.lead_data ADD decision_factors NVARCHAR(MAX) NULL;
GO
