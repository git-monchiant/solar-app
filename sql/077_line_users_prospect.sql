-- Allow a LINE user to be linked to a prospect (seeker flow) in addition to a
-- lead. A LINE user is either unlinked, or linked to exactly one of lead_id /
-- prospect_id — UI filters already-linked users out of the picker.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'prospect_id')
  ALTER TABLE line_users ADD prospect_id INT NULL FOREIGN KEY REFERENCES prospects(id);
GO
