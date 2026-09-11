-- 179: SITE_SURVEY is seven calendar days for every instance.
--
-- Early operational backfill created some completed instances with the retired
-- three-day deadline. Later policy migrations changed the catalogue to seven
-- days but intentionally preserved completed audit timestamps, leaving those
-- rows with a current policy version and a stale deadline. The business has
-- confirmed that seven days applies to all SITE_SURVEY history as well.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.sla_policies
SET target_minutes = 10080,
    warning_minutes = 2880,
    deadline_rule = 'CONFIRMED_SCHEDULED_APPOINTMENT',
    config_json = N'{"days":7,"anchor":"later_of_scheduled_or_confirmation","requiresConfirmation":true,"completion":"latest_forward_quote_transition","appliesToAllGrades":true}',
    updated_at = GETDATE()
WHERE policy_code = 'SITE_SURVEY'
  AND version = 6
  AND (
    target_minutes <> 10080
    OR warning_minutes <> 2880
    OR deadline_rule <> 'CONFIRMED_SCHEDULED_APPOINTMENT'
    OR ISNULL(JSON_VALUE(config_json, '$.days'), '') <> '7'
  );

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_target_at DATETIME2 NOT NULL,
  new_target_at DATETIME2 NOT NULL,
  old_due_at DATETIME2 NOT NULL,
  new_due_at DATETIME2 NOT NULL,
  old_status NVARCHAR(30) NOT NULL,
  new_status NVARCHAR(30) NOT NULL
);

;WITH desired AS (
  SELECT si.id,
         DATEADD(DAY, 7, si.started_at) AS target_at,
         DATEADD(DAY, 7, si.started_at) AS due_at,
         DATEADD(DAY, 5, si.started_at) AS warning_at,
         CASE
           WHEN si.status IN ('cancelled', 'superseded') THEN si.status
           WHEN si.completed_at IS NOT NULL THEN 'completed'
           WHEN GETDATE() > DATEADD(DAY, 7, si.started_at) THEN 'breached'
           WHEN DATEDIFF(MINUTE, GETDATE(), DATEADD(DAY, 7, si.started_at)) <= 30 THEN 'critical'
           WHEN GETDATE() >= DATEADD(DAY, 5, si.started_at) THEN 'warning'
           ELSE 'active'
         END AS status
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code = 'SITE_SURVEY'
)
UPDATE si
SET policy_version = 6,
    target_at = d.target_at,
    due_at = d.due_at,
    warning_at = d.warning_at,
    status = d.status,
    breached_at = CASE
      WHEN d.status IN ('cancelled', 'superseded') THEN NULL
      WHEN si.completed_at > d.due_at THEN si.completed_at
      WHEN si.completed_at IS NULL AND d.status = 'breached' THEN d.due_at
      ELSE NULL
    END,
    context_json = JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.siteSurveyDays', 7),
      '$.deadlineAlignedBy', 'site_survey_seven_days_all'
    ),
    updated_at = GETDATE()
OUTPUT INSERTED.id, INSERTED.lead_id,
       DELETED.target_at, INSERTED.target_at,
       DELETED.due_at, INSERTED.due_at,
       DELETED.status, INSERTED.status
INTO @changed(id, lead_id, old_target_at, new_target_at, old_due_at, new_due_at, old_status, new_status)
FROM dbo.lead_sla_instances si
JOIN desired d ON d.id = si.id
WHERE si.policy_version <> 6
   OR si.target_at <> d.target_at
   OR si.due_at <> d.due_at
   OR si.warning_at <> d.warning_at
   OR si.status <> d.status
   OR ISNULL(JSON_VALUE(si.context_json, '$.siteSurveyDays'), '') <> '7'
   OR ISNULL(JSON_VALUE(si.context_json, '$.deadlineAlignedBy'), '') <> 'site_survey_seven_days_all'
   OR (si.completed_at IS NOT NULL AND ISNULL(si.breached_at, '19000101') <>
       ISNULL(CASE WHEN si.completed_at > d.due_at THEN si.completed_at END, '19000101'))
   OR (si.completed_at IS NULL AND d.status <> 'breached' AND si.breached_at IS NOT NULL)
   OR (si.completed_at IS NULL AND d.status = 'breached' AND ISNULL(si.breached_at, '19000101') <> d.due_at);

INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key,
  from_status, to_status, event_at, detail_json
)
SELECT c.id, c.lead_id, 'deadline_changed',
       CONCAT('sla-deadline-seven-days:', c.id),
       c.old_status, c.new_status, GETDATE(),
       CONCAT(
         N'{"rule":"site_survey_seven_days_all","fromTargetAt":"', CONVERT(VARCHAR(33), c.old_target_at, 126),
         N'","toTargetAt":"', CONVERT(VARCHAR(33), c.new_target_at, 126),
         N'","fromDueAt":"', CONVERT(VARCHAR(33), c.old_due_at, 126),
         N'","toDueAt":"', CONVERT(VARCHAR(33), c.new_due_at, 126), N'"}'
       )
FROM @changed c
WHERE (c.old_target_at <> c.new_target_at OR c.old_due_at <> c.new_due_at)
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.lead_sla_events e
    WHERE e.event_key = CONCAT('sla-deadline-seven-days:', c.id)
  );

