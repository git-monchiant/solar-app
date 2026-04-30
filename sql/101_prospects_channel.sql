-- Tag a prospect with the channel that surfaced it. Codes:
--   senxpm   — imported from Sena's SenXPM list (default for the legacy data)
--   walk_in  — customer walked into a sales office
--   event    — booth/event lead
--   ads      — paid ad click-through
--   the1     — Central The1 partner list
--   web      — website form
--   refer    — referral
--   other    — anything else
-- Stored as a short code; the UI maps codes to labels. NULL = unknown.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'channel')
  ALTER TABLE prospects ADD channel NVARCHAR(20) NULL;
GO

-- Backfill: every prospect we have today came from the SenXPM import. Stamp
-- them so future entries from other channels stand out.
UPDATE prospects SET channel = 'senxpm' WHERE channel IS NULL;
