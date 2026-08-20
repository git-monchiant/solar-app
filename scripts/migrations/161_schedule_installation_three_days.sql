-- 161: SCHEDULE_INSTALLATION moves from 7 days to 3 days after the deposit is
-- confirmed, with a 1-day warning (the lead time the 3-day version of this
-- policy already used in migration 150). Applies to every grade.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SCHEDULE_INSTALLATION' AND version=3)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('SCHEDULE_INSTALLATION',3,N'นัดหมายติดตั้ง','stage',4320,1440,'CALENDAR_DAYS',
    N'{"days":3,"anchor":"deposit_confirmed","appliesToAllGrades":true,"warningMinutes":1440}');

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='SCHEDULE_INSTALLATION' AND version IN (1,2) AND is_active=1;

-- Recompute every instance that still carries a meaning. The anchor is
-- unchanged; only the period narrows, so some rows that were on time under the
-- 7-day rule become late here — including ones already completed.
;WITH recomputed AS (
  SELECT si.id, DATEADD(MINUTE,4320,si.started_at) AS new_due_at
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code='SCHEDULE_INSTALLATION'
    AND si.status NOT IN ('cancelled','superseded')
)
UPDATE si
SET policy_version=3,
    due_at=r.new_due_at,
    target_at=r.new_due_at,
    warning_at=DATEADD(MINUTE,-1440,r.new_due_at),
    status=CASE
      WHEN si.status='completed' THEN 'completed'
      WHEN GETDATE()>r.new_due_at THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),r.new_due_at)<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,-1440,r.new_due_at) THEN 'warning'
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
WHERE si.due_at<>r.new_due_at OR si.policy_version<>3;
