-- Track which LINE users have shared a phone number. The number is extracted
-- from inbound text messages (line_messages.text); the column lets us flag
-- "has phone" without re-scanning all messages on every render.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'phone')
  ALTER TABLE line_users ADD phone NVARCHAR(20) NULL;
GO

-- Backfill: latest 10-digit Thai mobile (0[6-9]XXXXXXXX) per user wins.
-- PATINDEX with [0-9] character classes is the closest SQL Server gets to a
-- regex. We pick the most recent message because customers often retype/correct
-- a number, and the latest one is the freshest contact.
;WITH ranked AS (
  SELECT
    lm.line_user_id,
    SUBSTRING(lm.text, PATINDEX('%0[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%', lm.text), 10) AS phone,
    ROW_NUMBER() OVER (PARTITION BY lm.line_user_id ORDER BY lm.received_at DESC) AS rn
  FROM line_messages lm
  WHERE lm.message_type = 'text'
    AND lm.text IS NOT NULL
    AND PATINDEX('%0[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%', lm.text) > 0
)
UPDATE lu
SET lu.phone = r.phone
FROM line_users lu
JOIN ranked r ON r.line_user_id = lu.line_user_id
WHERE r.rn = 1 AND lu.phone IS NULL;
