-- Re-run of the "X → X" reschedule cleanup after the TZ root-cause fix.
-- Migration 015 cleaned spurious rows accumulated up to its deploy time, but
-- between 015 running and the sameDay() TZ fix landing, the bug kept firing
-- on every PATCH that re-sent install_date / survey_date (e.g. OrderStep
-- auto-save on page refresh). Same logic as 015 — idempotent, safe to re-run.

;WITH parsed AS (
  SELECT
    id,
    title,
    LTRIM(RTRIM(LEFT(title, CHARINDEX(N' → ', title) - 1)))                                AS left_part,
    LTRIM(RTRIM(SUBSTRING(title, CHARINDEX(N' → ', title) + 3, LEN(title))))               AS right_part
  FROM dbo.lead_activities
  WHERE activity_type = 'appointment_rescheduled'
    AND CHARINDEX(N' → ', title) > 0
)
DELETE la
FROM dbo.lead_activities la
INNER JOIN parsed p ON p.id = la.id
WHERE LEN(p.right_part) > 0
  AND LEN(p.left_part) >= LEN(p.right_part)
  AND RIGHT(p.left_part, LEN(p.right_part)) = p.right_part;

PRINT 'post-TZ-fix: spurious appointment_rescheduled rows removed';
GO
