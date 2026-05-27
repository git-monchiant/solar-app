-- Accountant payment rejection notes — keyed by slip_field as JSON.
-- Shape: { "<slip_field>": { "reason": "...", "by": "...", "at": "ISO date" } }
-- Cleared per-slip when uploader resubmits draft slips (ยืนยัน 1).
-- Idempotent.
IF COL_LENGTH('leads', 'payment_reject_notes') IS NULL
  ALTER TABLE leads ADD payment_reject_notes NVARCHAR(MAX) NULL;
GO
