-- 176: SITE_SURVEY completes only on a forward Survey -> Quotation transition.
-- A rollback from Order/Install to Quotation remains in Activity Log but must
-- never replace the survey completion evidence. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SITE_SURVEY' AND version=6)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'SITE_SURVEY',6,N'เข้าตรวจสำรวจหน้างาน','stage',10080,2880,'CONFIRMED_SCHEDULED_APPOINTMENT',
    N'{"days":7,"anchor":"later_of_scheduled_or_confirmation","requiresConfirmation":true,"completion":"latest_forward_quote_transition","appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=6 THEN 1 ELSE 0 END,updated_at=GETDATE()
WHERE policy_code='SITE_SURVEY'
  AND is_active<>CASE WHEN version=6 THEN 1 ELSE 0 END;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_completed_at DATETIME2 NULL,
  new_completed_at DATETIME2 NOT NULL,
  old_activity_id BIGINT NULL,
  new_activity_id BIGINT NOT NULL
);

;WITH desired AS (
  SELECT si.id,forward_quote.id activity_id,forward_quote.created_at completed_at
  FROM dbo.lead_sla_instances si
  OUTER APPLY (
    SELECT TOP 1 a.id,a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id=si.lead_id
      AND a.activity_type='status_change'
      AND a.new_status='quote'
      AND (
        a.old_status='survey'
        OR (a.old_status IS NULL AND a.title LIKE N'Status:%รอสำรวจ%→%รอใบเสนอราคา%')
      )
    ORDER BY a.created_at DESC,a.id DESC
  ) forward_quote
  WHERE si.policy_code='SITE_SURVEY'
    AND si.status NOT IN ('cancelled','superseded')
    AND si.completed_at IS NOT NULL
    AND forward_quote.id IS NOT NULL
)
UPDATE si
SET policy_version=6,
    status='completed',
    completed_at=d.completed_at,
    completion_activity_id=d.activity_id,
    breached_at=CASE WHEN d.completed_at>si.due_at THEN d.completed_at ELSE NULL END,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.completionRule','latest_forward_quote_transition'),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.completed_at,INSERTED.completed_at,
       DELETED.completion_activity_id,INSERTED.completion_activity_id
INTO @changed(id,lead_id,old_completed_at,new_completed_at,old_activity_id,new_activity_id)
FROM dbo.lead_sla_instances si
JOIN desired d ON d.id=si.id
WHERE si.policy_version<>6
   OR ISNULL(si.completed_at,'19000101')<>d.completed_at
   OR ISNULL(si.completion_activity_id,-1)<>d.activity_id
   OR ISNULL(JSON_VALUE(si.context_json,'$.completionRule'),'')<>'latest_forward_quote_transition';

-- Keep the JSON write separate from the self-referencing CTE update. This is
-- also an explicit postcondition for rows changed only because their rule
-- label was stale.
UPDATE si
SET context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.completionRule','latest_forward_quote_transition'),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
JOIN @changed c ON c.id=si.id;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'completion_changed',
       CONCAT('sla-completion-forward-quote:',c.id,':',c.new_activity_id),
       'completed','completed',GETDATE(),
       CONCAT(N'{"rule":"latest_forward_quote_transition","fromCompletedAt":"',
              COALESCE(CONVERT(VARCHAR(33),c.old_completed_at,126),''),
              N'","toCompletedAt":"',CONVERT(VARCHAR(33),c.new_completed_at,126),
              N'","fromCompletionActivityId":',COALESCE(CONVERT(VARCHAR(30),c.old_activity_id),'null'),
              N',"toCompletionActivityId":',CONVERT(VARCHAR(30),c.new_activity_id),N'}')
FROM @changed c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-completion-forward-quote:',c.id,':',c.new_activity_id)
);

-- Open instances adopt the current policy without inventing completion.
UPDATE dbo.lead_sla_instances
SET policy_version=6,updated_at=GETDATE()
WHERE policy_code='SITE_SURVEY'
  AND status IN ('active','warning','critical','breached')
  AND policy_version<>6;
