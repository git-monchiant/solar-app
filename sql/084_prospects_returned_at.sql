-- Flag set when sales sends a lead back to seeker. Prospect is "ถูกส่งกลับ"
-- as long as returned_at is not null. Cleared when seeker syncs the prospect
-- back to the lead via the "ส่งข้อมูลกลับไปที่ลีด" button.
--
-- Needed because seeker edits (interest/visited_at/note) auto-save before the
-- user clicks the orange sync button — we can't use those fields to detect
-- the returned state or the badge flips prematurely.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'returned_at')
  ALTER TABLE prospects ADD returned_at DATETIME2 NULL;
GO

-- Backfill existing returned prospects (those linked to a lead currently in
-- 'returned' status) so they keep their badge after this deploy.
UPDATE p
SET p.returned_at = GETDATE()
FROM prospects p
JOIN leads l ON l.id = p.lead_id
WHERE l.status = 'returned' AND p.returned_at IS NULL;
GO
