-- Interest reasons captured during the seeker visit popup.
-- interest_reasons    = CSV of preset codes (e.g. "save_bill,has_ev")
-- interest_reason_note = free-text detail (used especially for "other")

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'interest_reasons')
  ALTER TABLE prospects ADD interest_reasons NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'interest_reason_note')
  ALTER TABLE prospects ADD interest_reason_note NVARCHAR(MAX) NULL;
GO
