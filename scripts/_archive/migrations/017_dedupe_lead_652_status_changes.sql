-- Dedupe status_change activity log on lead 652 — multiple identical
-- transitions (quote→order, order→quote-revert) piled up while the lead
-- bounced between staff PATCHes and admin revert scripts. The API has a
-- 30-second dedup window but entries here are minutes apart, so each one
-- legitimately got inserted.
--
-- Strategy: for each (old_status, new_status) pair under lead 652, keep
-- only the most recent row; delete the older duplicates. Preserves history
-- of distinct transitions (quote→order kept separate from order→quote).

;WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY old_status, new_status
      ORDER BY created_at DESC
    ) AS rn
  FROM dbo.lead_activities
  WHERE lead_id = 652
    AND activity_type = 'status_change'
)
DELETE la
FROM dbo.lead_activities la
INNER JOIN ranked r ON r.id = la.id
WHERE r.rn > 1;

PRINT 'lead 652 status_change duplicates collapsed (kept latest per transition)';
GO
