-- 160: PROPOSAL_ROI moves from 24 hours to 2 days after the survey is
-- completed, with a 12-hour warning (the lead time the 48-hour version of this
-- policy already used in migration 150). Applies to every grade.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='PROPOSAL_ROI' AND version=4)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('PROPOSAL_ROI',4,N'ส่ง Proposal หลัง Survey','stage',2880,720,'ELAPSED_MINUTES',
    N'{"hours":48,"anchor":"survey_completed","appliesToAllGrades":true,"warningMinutes":720}');

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='PROPOSAL_ROI' AND version IN (1,2,3) AND is_active=1;

-- Recompute every instance that still carries a meaning. The anchor is
-- unchanged; only the period widens. Completed rows keep their completion but
-- have their on-time verdict corrected, because a proposal sent 30 hours after
-- the survey was late under the old rule and is on time under this one.
;WITH recomputed AS (
  SELECT si.id, DATEADD(MINUTE,2880,si.started_at) AS new_due_at
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code='PROPOSAL_ROI'
    AND si.status NOT IN ('cancelled','superseded')
)
UPDATE si
SET policy_version=4,
    due_at=r.new_due_at,
    target_at=r.new_due_at,
    warning_at=DATEADD(MINUTE,-720,r.new_due_at),
    status=CASE
      WHEN si.status='completed' THEN 'completed'
      WHEN GETDATE()>r.new_due_at THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),r.new_due_at)<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,-720,r.new_due_at) THEN 'warning'
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
WHERE si.due_at<>r.new_due_at OR si.policy_version<>4;
