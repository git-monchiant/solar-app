-- Split out the activity event date from `created_at`.
--   followup_date    : the date the contact attempt happened (user-entered;
--                      DATE only, no time)
--   created_at       : the actual save timestamp (now always SYSDATETIME());
--                      stops being overridden to noon for backdated entries
--   follow_up_date   : (existing) the NEXT scheduled follow-up date — kept
--                      under its original name to avoid breaking callers
--
-- Backfill: existing backdated rows have created_at at exactly 12:00:00 noon
-- (the API override). Copy CAST(created_at AS DATE) into followup_date so the
-- event date is preserved. Rows with a non-noon time are real-time entries —
-- created_at already holds the truth, but we still set followup_date to the
-- date portion for display consistency.

ALTER TABLE lead_activities ADD followup_date DATE NULL;
GO

UPDATE lead_activities
   SET followup_date = CAST(created_at AS DATE)
 WHERE followup_date IS NULL;
