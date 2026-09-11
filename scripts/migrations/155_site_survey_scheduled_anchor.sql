-- 155: SITE_SURVEY starts at the scheduled survey date/time, not the time
-- the appointment activity was recorded. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

;WITH scheduled AS (
  SELECT l.id lead_id,
         CASE
           WHEN l.survey_date IS NOT NULL THEN
             DATEADD(MINUTE,
               COALESCE(DATEDIFF(MINUTE, CAST('00:00' AS time), slot.slot_time), 0),
               CAST(l.survey_date AS datetime2))
           ELSE COALESCE(booked.created_at, survey_done.created_at)
         END planned_at,
         booked.created_at appointment_recorded_at,
         CASE WHEN l.survey_date IS NOT NULL THEN 'scheduled_date_time'
              WHEN booked.created_at IS NOT NULL THEN 'appointment_recorded_at_fallback'
              WHEN survey_done.created_at IS NOT NULL THEN 'completion_at_legacy_fallback'
              ELSE NULL END base_anchor_source,
         survey_done.id survey_activity_id,
         survey_done.created_at survey_done_at
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 TRY_CONVERT(time(0), j.[value]) slot_time
    FROM OPENJSON(CASE WHEN ISJSON(COALESCE(l.survey_time_slot, '')) = 1
                       THEN l.survey_time_slot ELSE N'[]' END) j
    WHERE TRY_CONVERT(time(0), j.[value]) IS NOT NULL
    ORDER BY TRY_CONVERT(time(0), j.[value])
  ) slot
  OUTER APPLY (
    SELECT TOP 1 a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id = l.id
      AND a.activity_type = 'appointment_set'
      AND a.title LIKE N'%สำรวจ%'
    ORDER BY a.created_at, a.id
  ) booked
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id = l.id
      AND a.activity_type = 'status_change'
      AND a.new_status = 'quote'
    ORDER BY a.created_at, a.id
  ) survey_done
), desired AS (
  SELECT lead_id,
         CASE WHEN survey_done_at IS NOT NULL AND planned_at > survey_done_at
                THEN CASE WHEN appointment_recorded_at <= survey_done_at
                          THEN appointment_recorded_at ELSE survey_done_at END
              ELSE planned_at END scheduled_at,
         CASE WHEN survey_done_at IS NOT NULL AND planned_at > survey_done_at
                THEN CASE WHEN appointment_recorded_at <= survey_done_at
                          THEN 'appointment_recorded_at_inconsistent_schedule'
                          ELSE 'completion_at_inconsistent_schedule' END
              ELSE base_anchor_source END anchor_source,
         survey_activity_id, survey_done_at,
         DATEADD(MINUTE, 4320,
           CASE WHEN survey_done_at IS NOT NULL AND planned_at > survey_done_at
                  THEN CASE WHEN appointment_recorded_at <= survey_done_at
                            THEN appointment_recorded_at ELSE survey_done_at END
                ELSE planned_at END) due_at,
         DATEADD(MINUTE, 2880,
           CASE WHEN survey_done_at IS NOT NULL AND planned_at > survey_done_at
                  THEN CASE WHEN appointment_recorded_at <= survey_done_at
                            THEN appointment_recorded_at ELSE survey_done_at END
                ELSE planned_at END) warning_at
  FROM scheduled
  WHERE planned_at IS NOT NULL
)
UPDATE si
SET started_at = d.scheduled_at,
    target_at = d.due_at,
    due_at = d.due_at,
    warning_at = d.warning_at,
    completed_at = d.survey_done_at,
    completion_activity_id = d.survey_activity_id,
    status = CASE WHEN d.survey_done_at IS NOT NULL THEN 'completed'
                  WHEN GETDATE() > d.due_at THEN 'breached'
                  WHEN DATEDIFF(MINUTE, GETDATE(), d.due_at) <= 30 THEN 'critical'
                  WHEN GETDATE() >= d.warning_at THEN 'warning'
                  ELSE 'active' END,
    breached_at = CASE WHEN d.survey_done_at > d.due_at THEN d.survey_done_at
                       WHEN d.survey_done_at IS NULL AND GETDATE() > d.due_at
                         THEN COALESCE(si.breached_at, GETDATE())
                       ELSE NULL END,
    context_json = JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.anchorSource', d.anchor_source),
      '$.surveyMilestoneRule', 3),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN desired d ON d.lead_id = si.lead_id
WHERE si.policy_code = 'SITE_SURVEY'
  AND si.instance_key LIKE 'operational:%'
  AND si.status NOT IN ('cancelled', 'superseded')
  AND (
    si.started_at <> d.scheduled_at
    OR ISNULL(si.completed_at, '19000101') <> ISNULL(d.survey_done_at, '19000101')
    OR ISNULL(si.completion_activity_id, -1) <> ISNULL(d.survey_activity_id, -1)
    OR ISNULL(JSON_VALUE(si.context_json, '$.surveyMilestoneRule'), '0') <> '3'
  );

INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key, event_at, detail_json
)
SELECT si.id, si.lead_id, 'milestone_corrected',
       CONCAT('sla-milestone-corrected:', si.id, ':site-survey-rule-v3'),
       GETDATE(),
       CONCAT(N'{"rule":"site_survey_v3","anchor":"',
              JSON_VALUE(si.context_json, '$.anchorSource'), N'"}')
FROM dbo.lead_sla_instances si
WHERE si.policy_code = 'SITE_SURVEY'
  AND JSON_VALUE(si.context_json, '$.surveyMilestoneRule') = '3'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key = CONCAT('sla-milestone-corrected:', si.id, ':site-survey-rule-v3')
  );

-- Old migrations could open SITE_SURVEY from a payment/pre-booking timestamp.
-- Without a scheduled date, appointment activity, or completed survey there is
-- no valid SITE_SURVEY anchor, so keep it closed until an appointment exists.
UPDATE si
SET status = 'cancelled', completed_at = NULL, completion_activity_id = NULL,
    breached_at = NULL,
    context_json = JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.surveyMilestoneRule', 3),
      '$.cancellationReason', 'missing_survey_appointment'),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id = si.lead_id
WHERE si.policy_code = 'SITE_SURVEY'
  AND si.instance_key LIKE 'operational:%'
  AND si.status NOT IN ('cancelled', 'superseded')
  AND l.survey_date IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'appointment_set'
      AND a.title LIKE N'%สำรวจ%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'status_change'
      AND a.new_status = 'quote'
  );

INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key, event_at, detail_json
)
SELECT si.id, si.lead_id, 'cancelled',
       CONCAT('sla-cancelled:', si.id, ':missing-survey-appointment-v3'),
       GETDATE(), N'{"rule":"site_survey_v3","reason":"missing_survey_appointment"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code = 'SITE_SURVEY'
  AND JSON_VALUE(si.context_json, '$.cancellationReason') = 'missing_survey_appointment'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key = CONCAT('sla-cancelled:', si.id, ':missing-survey-appointment-v3')
  );

INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key, event_at, detail_json
)
SELECT si.id, si.lead_id, 'data_inconsistency_guarded',
       CONCAT('sla-data-guarded:', si.id, ':site-survey-rule-v3'), GETDATE(),
       CONCAT(N'{"rule":"site_survey_v3","anchor":"',
              JSON_VALUE(si.context_json, '$.anchorSource'),
              N'","reason":"scheduled_time_after_completion"}')
FROM dbo.lead_sla_instances si
WHERE si.policy_code = 'SITE_SURVEY'
  AND JSON_VALUE(si.context_json, '$.anchorSource') LIKE '%inconsistent_schedule'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key = CONCAT('sla-data-guarded:', si.id, ':site-survey-rule-v3')
  );
