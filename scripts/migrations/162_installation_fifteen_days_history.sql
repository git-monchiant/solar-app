-- 162: Restate historical INSTALLATION instances under the 15-day policy.
-- sla-service and policy version 2 already use 15 days, but instances that were
-- completed while version 1 was in force kept its 7-day target / 14-day hard
-- limit and still display "SLA 7 วัน / สูงสุด 14 วัน". This aligns every row on
-- one yardstick: 15 days, warned 3 days ahead.
-- The deadline only moves later, so a verdict can change from late to on time,
-- never the other way round.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='INSTALLATION' AND version=1 AND is_active=1;

;WITH recomputed AS (
  SELECT si.id, DATEADD(MINUTE,21600,si.started_at) AS new_due_at
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code='INSTALLATION'
    AND si.status NOT IN ('cancelled','superseded')
)
UPDATE si
SET policy_version=2,
    due_at=r.new_due_at,
    target_at=r.new_due_at,
    warning_at=DATEADD(MINUTE,-4320,r.new_due_at),
    status=CASE
      WHEN si.status='completed' THEN 'completed'
      WHEN GETDATE()>r.new_due_at THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),r.new_due_at)<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,-4320,r.new_due_at) THEN 'warning'
      ELSE 'active'
    END,
    breached_at=CASE
      WHEN si.status='completed'
        THEN CASE WHEN si.completed_at>r.new_due_at THEN si.completed_at ELSE NULL END
      WHEN GETDATE()>r.new_due_at THEN COALESCE(si.breached_at,GETDATE())
      ELSE NULL
    END,
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
JOIN recomputed r ON r.id=si.id
WHERE si.due_at<>r.new_due_at OR si.target_at<>r.new_due_at OR si.policy_version<>2;
