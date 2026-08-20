-- 158: Qualification (ELECTRICITY_ASSESSMENT) becomes one flat deadline for
-- every lead source: 24 hours from the first contact that actually connected.
-- This supersedes the source-based windows (30/60/120 minutes) introduced by
-- policy version 2 in migration 156. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'ELECTRICITY_ASSESSMENT' AND version = 3)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('ELECTRICITY_ASSESSMENT', 3, N'ประเมินและกำหนด Grade Lead', 'qualification', 1440, 240, 'ELAPSED_MINUTES',
    N'{"hours":24,"anchor":"first_connected_contact","appliesToAllSources":true,"timezone":"Asia/Bangkok","warningMinutes":240}');

UPDATE dbo.sla_policies
SET is_active = 0, updated_at = GETDATE()
WHERE policy_code = 'ELECTRICITY_ASSESSMENT' AND version IN (1, 2) AND is_active = 1;

-- Recompute every qualification instance that still carries a meaning. The
-- anchor (started_at) is unchanged - it is already the first connected contact,
-- or the synthetic grade epoch for leads backfilled by migration 156. Completed
-- rows keep their completion but have their on-time verdict corrected, since
-- the retracted source rule could have marked a lead late that the new 24-hour
-- rule considers on time.
;WITH recomputed AS (
  SELECT si.id, DATEADD(MINUTE, 1440, si.started_at) AS new_due_at
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code = 'ELECTRICITY_ASSESSMENT'
    AND si.status NOT IN ('cancelled', 'superseded')
)
UPDATE si
SET policy_version = 3,
    due_at = r.new_due_at,
    target_at = r.new_due_at,
    warning_at = DATEADD(MINUTE, -240, r.new_due_at),
    status = CASE
      WHEN si.status = 'completed' THEN 'completed'
      WHEN GETDATE() > r.new_due_at THEN 'breached'
      WHEN DATEDIFF(MINUTE, GETDATE(), r.new_due_at) <= 30 THEN 'critical'
      WHEN GETDATE() >= DATEADD(MINUTE, -240, r.new_due_at) THEN 'warning'
      ELSE 'active'
    END,
    breached_at = CASE
      WHEN si.status = 'completed'
        THEN CASE WHEN si.completed_at > r.new_due_at THEN si.completed_at ELSE NULL END
      WHEN GETDATE() > r.new_due_at THEN COALESCE(si.breached_at, GETDATE())
      ELSE NULL
    END,
    context_json = JSON_MODIFY(JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.deadlineRule', 'ELAPSED_MINUTES'), '$.qualificationRuleVersion', 3),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN recomputed r ON r.id = si.id
WHERE si.due_at <> r.new_due_at OR si.policy_version <> 3;
