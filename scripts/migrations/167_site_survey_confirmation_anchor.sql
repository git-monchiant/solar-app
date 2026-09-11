-- 167: SITE_SURVEY cannot start before the survey appointment is confirmed.
--
-- The booked slot remains the normal anchor. If confirmation is recorded after
-- that slot, move the anchor to the confirmation activity; the Survey UI keeps
-- every field-work substep locked until that confirmation. Open appointments
-- without confirmation no longer carry a field-work SLA.
--
-- Completed history keeps the target/due/warning intervals already attached to
-- each instance (legacy rows can be 3 or 7 days). Open work moves to policy v4,
-- which retains the current 7-day duration. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SITE_SURVEY' AND version=4)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'SITE_SURVEY',4,N'เข้าตรวจสำรวจหน้างาน','stage',10080,2880,'CONFIRMED_SCHEDULED_APPOINTMENT',
    N'{"days":7,"anchor":"later_of_scheduled_or_confirmation","requiresConfirmation":true,"appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=4 THEN 1 ELSE 0 END, updated_at=GETDATE()
WHERE policy_code='SITE_SURVEY'
  AND is_active<>CASE WHEN version=4 THEN 1 ELSE 0 END;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_started_at DATETIME2 NOT NULL,
  new_started_at DATETIME2 NOT NULL,
  old_status NVARCHAR(30) NULL,
  new_status NVARCHAR(30) NULL
);

;WITH src AS (
  SELECT si.id, si.lead_id, si.status, si.started_at, si.target_at,
         si.due_at, si.warning_at, si.completed_at,
         confirmed.created_at AS confirmed_at,
         DATEDIFF(SECOND,si.started_at,si.target_at) AS target_seconds,
         DATEDIFF(SECOND,si.started_at,si.due_at) AS due_seconds,
         DATEDIFF(SECOND,si.started_at,si.warning_at) AS warning_seconds
  FROM dbo.lead_sla_instances si
  JOIN dbo.leads l ON l.id=si.lead_id
  OUTER APPLY (
    SELECT TOP 1 a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id=si.lead_id
      AND a.activity_type='appointment_confirmed'
      AND a.title LIKE N'%สำรวจ%'
      AND (si.completed_at IS NULL OR a.created_at<=si.completed_at)
    ORDER BY a.created_at DESC,a.id DESC
  ) confirmed
  WHERE si.policy_code='SITE_SURVEY'
    AND si.instance_key LIKE 'operational:%'
    AND si.status NOT IN ('cancelled','superseded')
    AND l.survey_confirmed=1
    AND confirmed.created_at IS NOT NULL
), desired AS (
  SELECT s.*,
         CASE WHEN s.confirmed_at>s.started_at THEN s.confirmed_at ELSE s.started_at END AS new_started_at
  FROM src s
), deadlines AS (
  SELECT d.*,
         CASE WHEN d.completed_at IS NOT NULL
                THEN DATEADD(SECOND,d.target_seconds,d.new_started_at)
              ELSE DATEADD(MINUTE,10080,d.new_started_at) END AS new_target_at,
         CASE WHEN d.completed_at IS NOT NULL
                THEN DATEADD(SECOND,d.due_seconds,d.new_started_at)
              ELSE DATEADD(MINUTE,10080,d.new_started_at) END AS new_due_at,
         CASE WHEN d.completed_at IS NOT NULL
                THEN DATEADD(SECOND,d.warning_seconds,d.new_started_at)
              ELSE DATEADD(MINUTE,7200,d.new_started_at) END AS new_warning_at
  FROM desired d
)
UPDATE si
SET policy_version=CASE WHEN d.completed_at IS NULL THEN 4 ELSE si.policy_version END,
    started_at=d.new_started_at,
    target_at=d.new_target_at,
    due_at=d.new_due_at,
    warning_at=d.new_warning_at,
    status=CASE
      WHEN d.completed_at IS NOT NULL THEN 'completed'
      WHEN GETDATE()>d.new_due_at THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),d.new_due_at)<=30 THEN 'critical'
      WHEN GETDATE()>=d.new_warning_at THEN 'warning'
      ELSE 'active'
    END,
    breached_at=CASE
      WHEN d.completed_at IS NOT NULL
        THEN CASE WHEN d.completed_at>d.new_due_at THEN d.completed_at ELSE NULL END
      WHEN GETDATE()>d.new_due_at THEN COALESCE(si.breached_at,GETDATE())
      ELSE NULL
    END,
    context_json=JSON_MODIFY(
      JSON_MODIFY(
        JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.surveyConfirmationRule',1),
        '$.anchorSource',
        CASE WHEN d.confirmed_at>d.started_at
               THEN 'confirmation_after_scheduled_time'
             ELSE 'scheduled_date_time' END
      ),
      '$.cancellationReason',NULL
    ),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.started_at,INSERTED.started_at,
       DELETED.status,INSERTED.status
INTO @changed(id,lead_id,old_started_at,new_started_at,old_status,new_status)
FROM dbo.lead_sla_instances si
JOIN deadlines d ON d.id=si.id
WHERE d.new_started_at<>si.started_at
   OR (d.completed_at IS NULL AND si.policy_version<>4)
   OR ISNULL(JSON_VALUE(si.context_json,'$.surveyConfirmationRule'),'0')<>'1';

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'anchor_changed',
       CONCAT('sla-anchor-changed:',c.id,':survey-confirmation-v1'),
       c.old_status,c.new_status,GETDATE(),
       CONCAT(N'{"rule":"survey_confirmation_v1","from":"',
              CONVERT(VARCHAR(33),c.old_started_at,126),N'","to":"',
              CONVERT(VARCHAR(33),c.new_started_at,126),N'"}')
FROM @changed c
WHERE c.old_started_at<>c.new_started_at
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-anchor-changed:',c.id,':survey-confirmation-v1')
  );

DECLARE @cancelled TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_status NVARCHAR(30) NULL
);

UPDATE si
SET status='cancelled',completed_at=NULL,completion_activity_id=NULL,
    breached_at=NULL,
    context_json=JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.surveyConfirmationRule',1),
      '$.cancellationReason','survey_confirmation_required'
    ),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.status
INTO @cancelled(id,lead_id,old_status)
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='SITE_SURVEY'
  AND si.instance_key LIKE 'operational:%'
  AND si.status IN ('active','warning','critical','breached')
  AND l.survey_confirmed=0;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'cancelled',
       CONCAT('sla-cancelled:',c.id,':survey-confirmation-required-v1'),
       c.old_status,'cancelled',GETDATE(),
       N'{"rule":"survey_confirmation_v1","reason":"survey_confirmation_required"}'
FROM @cancelled c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':survey-confirmation-required-v1')
);
