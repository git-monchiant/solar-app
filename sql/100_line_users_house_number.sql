-- Same idea as 099 (phone), but for "บ้านเลขที่" mentions. Used to stamp the
-- LINE growth chart blue when a user has shared either contact info.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'house_number')
  ALTER TABLE line_users ADD house_number NVARCHAR(50) NULL;
GO

-- Backfill: take a window after the literal "บ้านเลขที่" in the most recent
-- message that mentions it. The window is rough — newlines and colons are
-- stripped — but it's good enough for the visual stamp; precise parsing
-- happens in the webhook for new incoming messages.
;WITH ranked AS (
  SELECT
    lm.line_user_id,
    LTRIM(REPLACE(REPLACE(REPLACE(
      SUBSTRING(lm.text, PATINDEX(N'%บ้านเลขที่%', lm.text) + 10, 30),
      CHAR(13), ' '), CHAR(10), ' '), ':', ' ')) AS house_window,
    ROW_NUMBER() OVER (PARTITION BY lm.line_user_id ORDER BY lm.received_at DESC) AS rn
  FROM line_messages lm
  WHERE lm.message_type = 'text'
    AND lm.text IS NOT NULL
    AND lm.text LIKE N'%บ้านเลขที่%'
)
UPDATE lu
SET lu.house_number = LEFT(LTRIM(r.house_window), 50)
FROM line_users lu
JOIN ranked r ON r.line_user_id = lu.line_user_id
WHERE r.rn = 1 AND lu.house_number IS NULL;
