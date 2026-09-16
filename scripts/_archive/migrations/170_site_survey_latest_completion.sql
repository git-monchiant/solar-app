-- 170: SITE_SURVEY completes at the latest transition into Quotation.
--
-- A lead can return to Survey and complete it again. The central Timeline keeps
-- every transition for audit, while the SLA must close on the final durable
-- status_change with new_status='quote'. Preserve each instance's existing
-- anchor/deadline and refresh only its completion evidence. Forward-only and
-- idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SITE_SURVEY' AND version=5)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'SITE_SURVEY',5,N'เข้าตรวจสำรวจหน้างาน','stage',10080,2880,'CONFIRMED_SCHEDULED_APPOINTMENT',
    N'{"days":7,"anchor":"later_of_scheduled_or_confirmation","requiresConfirmation":true,"completion":"latest_quote_transition","appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=5 THEN 1 ELSE 0 END, updated_at=GETDATE()
WHERE policy_code='SITE_SURVEY'
  AND is_active<>CASE WHEN version=5 THEN 1 ELSE 0 END;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_completed_at DATETIME2 NULL,
  new_completed_at DATETIME2 NOT NULL,
  old_activity_id BIGINT NULL,
  new_activity_id BIGINT NOT NULL
);

;WITH latest_completion AS (
  SELECT si.id,si.lead_id,si.completed_at,si.completion_activity_id,si.due_at,
         latest_quote.id AS latest_activity_id,
         latest_quote.created_at AS latest_completed_at
  FROM dbo.lead_sla_instances si
  OUTER APPLY (
    SELECT TOP 1 a.id,a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id=si.lead_id
      AND a.activity_type='status_change'
      AND a.new_status='quote'
    ORDER BY a.created_at DESC,a.id DESC
  ) latest_quote
  WHERE si.policy_code='SITE_SURVEY'
    AND si.instance_key LIKE 'operational:%'
    AND si.status NOT IN ('cancelled','superseded')
    AND si.completed_at IS NOT NULL
    AND latest_quote.id IS NOT NULL
)
UPDATE si
SET policy_version=5,
    status='completed',
    completed_at=src.latest_completed_at,
    completion_activity_id=src.latest_activity_id,
    breached_at=CASE WHEN src.latest_completed_at>si.due_at
                     THEN src.latest_completed_at ELSE NULL END,
    context_json=JSON_MODIFY(
      COALESCE(si.context_json,'{}'),
      '$.completionRule',
      'latest_quote_transition'
    ),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.completed_at,INSERTED.completed_at,
       DELETED.completion_activity_id,INSERTED.completion_activity_id
INTO @changed(id,lead_id,old_completed_at,new_completed_at,old_activity_id,new_activity_id)
FROM dbo.lead_sla_instances si
JOIN latest_completion src ON src.id=si.id
WHERE ISNULL(si.completed_at,'19000101')<>src.latest_completed_at
   OR ISNULL(si.completion_activity_id,-1)<>src.latest_activity_id;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'completion_changed',
       CONCAT('sla-completion-changed:',c.id,':',c.new_activity_id),
       'completed','completed',c.new_completed_at,
       CONCAT(N'{"rule":"latest_quote_transition","fromCompletedAt":"',
              COALESCE(CONVERT(VARCHAR(33),c.old_completed_at,126),''),
              N'","toCompletedAt":"',CONVERT(VARCHAR(33),c.new_completed_at,126),
              N'","fromCompletionActivityId":',COALESCE(CONVERT(VARCHAR(30),c.old_activity_id),'null'),
              N',"toCompletionActivityId":',CONVERT(VARCHAR(30),c.new_activity_id),N'}')
FROM @changed c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-completion-changed:',c.id,':',c.new_activity_id)
);
