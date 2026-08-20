-- 153: Separate pre-survey document creation from the real survey appointment.
-- BOOK_SURVEY completes at appointment_set; SITE_SURVEY starts at that same event.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

;WITH corrected AS (
  SELECT l.id lead_id,
         COALESCE(assessment.created_at, l.pre_booked_at, booked.created_at, survey_done.created_at) assessment_at,
         booked.id booked_activity_id, booked.created_at booked_at,
         survey_done.id survey_activity_id, survey_done.created_at survey_done_at
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND (a.title LIKE N'%เสนอขาย%' OR a.activity_type = 'sales_assessment')
    ORDER BY a.created_at, a.id
  ) assessment
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'appointment_set' AND a.title LIKE N'%สำรวจ%'
    ORDER BY a.created_at, a.id
  ) booked
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'status_change' AND a.new_status = 'quote'
    ORDER BY a.created_at, a.id
  ) survey_done
), desired AS (
  SELECT lead_id, 'BOOK_SURVEY' policy_code, assessment_at started_at,
         booked_at completed_at, COALESCE(booked_activity_id, survey_activity_id) completion_activity_id,
         1440 due_minutes, 240 warning_minutes
  FROM corrected WHERE assessment_at IS NOT NULL AND booked_at IS NOT NULL
  UNION ALL
  SELECT lead_id, 'SITE_SURVEY', booked_at, survey_done_at, survey_activity_id,
         4320, 1440
  FROM corrected WHERE booked_at IS NOT NULL
)
UPDATE si
SET started_at = d.started_at,
    target_at = DATEADD(MINUTE, d.due_minutes, d.started_at),
    due_at = DATEADD(MINUTE, d.due_minutes, d.started_at),
    warning_at = DATEADD(MINUTE, -d.warning_minutes, DATEADD(MINUTE, d.due_minutes, d.started_at)),
    completed_at = d.completed_at,
    completion_activity_id = d.completion_activity_id,
    status = CASE WHEN d.completed_at IS NOT NULL THEN 'completed'
                  WHEN GETDATE() > DATEADD(MINUTE, d.due_minutes, d.started_at) THEN 'breached'
                  WHEN DATEDIFF(MINUTE, GETDATE(), DATEADD(MINUTE, d.due_minutes, d.started_at)) <= 30 THEN 'critical'
                  WHEN GETDATE() >= DATEADD(MINUTE, -d.warning_minutes, DATEADD(MINUTE, d.due_minutes, d.started_at)) THEN 'warning'
                  ELSE 'active' END,
    breached_at = CASE WHEN d.completed_at > DATEADD(MINUTE, d.due_minutes, d.started_at)
                         THEN COALESCE(si.breached_at, d.completed_at)
                       WHEN d.completed_at IS NULL AND GETDATE() > DATEADD(MINUTE, d.due_minutes, d.started_at)
                         THEN COALESCE(si.breached_at, GETDATE())
                       ELSE NULL END,
    context_json = JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.surveyMilestoneRule', 2),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN desired d ON d.lead_id = si.lead_id AND d.policy_code = si.policy_code
WHERE si.instance_key LIKE 'operational:%'
  AND si.status NOT IN ('cancelled', 'superseded')
  AND (
    si.started_at <> d.started_at
    OR ISNULL(si.completed_at, '19000101') <> ISNULL(d.completed_at, '19000101')
    OR ISNULL(si.completion_activity_id, -1) <> ISNULL(d.completion_activity_id, -1)
    OR JSON_VALUE(si.context_json, '$.surveyMilestoneRule') IS NULL
  );

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, event_at, detail_json)
SELECT si.id, si.lead_id, 'milestone_corrected', CONCAT('sla-milestone-corrected:', si.id, ':survey-rule-v2'),
       GETDATE(), N'{"rule":"survey_milestone_v2","bookSurveyCompletion":"appointment_set","siteSurveyAnchor":"appointment_set"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code IN ('BOOK_SURVEY', 'SITE_SURVEY')
  AND JSON_VALUE(si.context_json, '$.surveyMilestoneRule') = '2'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key = CONCAT('sla-milestone-corrected:', si.id, ':survey-rule-v2')
  );
