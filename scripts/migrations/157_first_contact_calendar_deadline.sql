-- 157: First Contact returns to a single Bangkok contact-window deadline that
-- is identical for every lead source.
--   received 09:00-18:59 -> 23:59:59 the same day
--   received 19:00-23:59 -> 12:00 the next day
--   received 00:00-08:59 -> 12:00 the same day
-- This supersedes the source-based windows introduced by policy version 2 in
-- migration 156. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'FIRST_CONTACT' AND version = 3)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('FIRST_CONTACT', 3, N'ติดต่อ Lead ครั้งแรก', 'response', NULL, 120, 'BANGKOK_CONTACT_WINDOW',
    N'{"timezone":"Asia/Bangkok","dayWindow":"09:00-19:00","dayDeadline":"23:59:59","nightDeadline":"12:00:00","appliesToAllSources":true,"warningMinutes":120}');

UPDATE dbo.sla_policies
SET is_active = 0, updated_at = GETDATE()
WHERE policy_code = 'FIRST_CONTACT' AND version IN (1, 2) AND is_active = 1;

-- Recompute every First Contact instance that is still meaningful. Version 1
-- rows already used this formula and stay unchanged, so the WHERE guard makes
-- re-runs a no-op; version 2 rows carry the retracted source-based deadline and
-- are corrected here, including the on-time verdict of ones already completed.
;WITH recomputed AS (
  SELECT si.id, si.status, si.due_at, si.warning_at, si.target_at, si.policy_version, si.completed_at,
    CASE
      WHEN CAST(si.started_at AS TIME) >= '09:00:00' AND CAST(si.started_at AS TIME) < '19:00:00'
        THEN DATEADD(SECOND, 86399, CAST(CAST(si.started_at AS DATE) AS DATETIME2))
      WHEN CAST(si.started_at AS TIME) >= '19:00:00'
        THEN DATEADD(HOUR, 12, CAST(DATEADD(DAY, 1, CAST(si.started_at AS DATE)) AS DATETIME2))
      ELSE DATEADD(HOUR, 12, CAST(CAST(si.started_at AS DATE) AS DATETIME2))
    END AS new_due_at
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code = 'FIRST_CONTACT'
    AND si.status NOT IN ('cancelled', 'superseded')
)
UPDATE si
SET policy_version = 3,
    due_at = r.new_due_at,
    target_at = r.new_due_at,
    warning_at = DATEADD(MINUTE, -120, r.new_due_at),
    status = CASE
      WHEN si.status = 'completed' THEN 'completed'
      WHEN GETDATE() > r.new_due_at THEN 'breached'
      WHEN DATEDIFF(MINUTE, GETDATE(), r.new_due_at) <= 30 THEN 'critical'
      WHEN GETDATE() >= DATEADD(MINUTE, -120, r.new_due_at) THEN 'warning'
      ELSE 'active'
    END,
    breached_at = CASE
      WHEN si.status = 'completed'
        THEN CASE WHEN si.completed_at > r.new_due_at THEN si.completed_at ELSE NULL END
      WHEN GETDATE() > r.new_due_at THEN COALESCE(si.breached_at, GETDATE())
      ELSE NULL
    END,
    context_json = JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.deadlineRule', 'BANGKOK_CONTACT_WINDOW'),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN recomputed r ON r.id = si.id
WHERE si.due_at <> r.new_due_at
   OR si.target_at <> r.new_due_at
   OR ISNULL(si.warning_at, '19000101') <> DATEADD(MINUTE, -120, r.new_due_at)
   OR si.policy_version <> 3;

INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key,
  from_status, to_status, event_at, detail_json
)
SELECT si.id, si.lead_id, 'milestone_corrected',
       CONCAT('sla-first-contact-deadline:', si.id, ':rule-v3'),
       NULL, si.status, GETDATE(),
       CONCAT('{"ruleVersion":3,"deadlineRule":"BANGKOK_CONTACT_WINDOW","dueAt":"',
              CONVERT(NVARCHAR(30), si.due_at, 126), '"}')
FROM dbo.lead_sla_instances si
WHERE si.policy_code = 'FIRST_CONTACT'
  AND si.policy_version = 3
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events ev
    WHERE ev.event_key = CONCAT('sla-first-contact-deadline:', si.id, ':rule-v3')
  );
