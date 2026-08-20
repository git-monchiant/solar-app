-- 154: Close legacy FIRST_CONTACT SLA from the earliest explicit contact
-- attempt, or from a survey appointment when no contact attempt was recorded.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

;WITH evidence AS (
  SELECT l.id lead_id,
         COALESCE(first_attempt.id, survey_appointment.id) activity_id,
         COALESCE(first_attempt.created_at, survey_appointment.created_at) completed_at,
         CASE WHEN first_attempt.id IS NOT NULL THEN 'contact_activity'
              WHEN survey_appointment.id IS NOT NULL THEN 'survey_appointment' END evidence_source
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id = l.id
      AND a.activity_type IN ('call','visit','line','other','follow_up')
      AND (a.contact_result IS NOT NULL
        OR (a.contact_result IS NULL
          AND a.title NOT LIKE N'ติดต่อไม่ได้%'
          AND a.title NOT LIKE N'%ข้อมูลติดต่อไม่ถูกต้อง%'))
    ORDER BY a.created_at, a.id
  ) first_attempt
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id = l.id
      AND a.activity_type = 'appointment_set'
      AND a.title LIKE N'%สำรวจ%'
    ORDER BY a.created_at, a.id
  ) survey_appointment
)
UPDATE si
SET status = 'completed',
    completed_at = e.completed_at,
    completion_activity_id = e.activity_id,
    breached_at = CASE WHEN e.completed_at > si.due_at THEN e.completed_at ELSE NULL END,
    context_json = JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.firstContactEvidenceRule', 2),
      '$.completionEvidence', e.evidence_source
    ),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN evidence e ON e.lead_id = si.lead_id
WHERE si.policy_code = 'FIRST_CONTACT'
  AND si.status NOT IN ('cancelled', 'superseded')
  AND e.completed_at IS NOT NULL
  AND (
    ISNULL(si.completed_at, '19000101') <> e.completed_at
    OR ISNULL(si.completion_activity_id, -1) <> e.activity_id
    OR JSON_VALUE(si.context_json, '$.firstContactEvidenceRule') IS NULL
  );

UPDATE retry
SET status = 'cancelled',
    context_json = JSON_MODIFY(COALESCE(retry.context_json, '{}'), '$.cancelReason', 'first_contact_evidence'),
    updated_at = GETDATE()
FROM dbo.lead_sla_instances retry
WHERE retry.policy_code = 'CONTACT_RETRY'
  AND retry.status IN ('active', 'warning', 'critical', 'breached')
  AND EXISTS (
    SELECT 1 FROM dbo.lead_sla_instances first_contact
    WHERE first_contact.lead_id = retry.lead_id
      AND first_contact.policy_code = 'FIRST_CONTACT'
      AND JSON_VALUE(first_contact.context_json, '$.firstContactEvidenceRule') = '2'
  );

UPDATE l
SET next_follow_up = NULL, updated_at = GETDATE()
FROM dbo.leads l
WHERE l.next_follow_up IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM dbo.lead_sla_instances si
    WHERE si.lead_id = l.id AND si.policy_code = 'FIRST_CONTACT'
      AND JSON_VALUE(si.context_json, '$.firstContactEvidenceRule') = '2'
  );

INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key,
  from_status, to_status, event_at, detail_json
)
SELECT si.id, si.lead_id, 'milestone_corrected',
       CONCAT('sla-first-contact-evidence:', si.id, ':rule-v2'),
       NULL, 'completed', GETDATE(),
       CONCAT('{"ruleVersion":2,"activityId":', si.completion_activity_id,
              ',"evidenceSource":"', JSON_VALUE(si.context_json, '$.completionEvidence'), '"}')
FROM dbo.lead_sla_instances si
WHERE si.policy_code = 'FIRST_CONTACT'
  AND JSON_VALUE(si.context_json, '$.firstContactEvidenceRule') = '2'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events ev
    WHERE ev.event_key = CONCAT('sla-first-contact-evidence:', si.id, ':rule-v2')
  );
