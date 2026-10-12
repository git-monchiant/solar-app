-- Questionnaire §1 (Customer Demographics) — the payment form the customer is
-- interested in, asked right after household income. Single-select: one option
-- code (cash / loan / credit_card), NULL until answered.
--
-- NOT the same thing as leads.payment_type: that one is the method used to pay
-- the pre-survey fee, written when the lead advances to survey. This column is
-- the interest signal captured while the lead is still being qualified, so the
-- two can be compared later.

IF COL_LENGTH('dbo.lead_data', 'payment_interest') IS NULL
  ALTER TABLE dbo.lead_data ADD payment_interest NVARCHAR(100) NULL;
GO
