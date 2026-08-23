-- 178: PROPOSAL_ROI completion and DEPOSIT_CLOSE anchor follow the latest
-- forward transition into Order after a rollback/re-entry cycle. Activity Log
-- remains the complete audit trail. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='PROPOSAL_ROI' AND version=5)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'PROPOSAL_ROI',5,N'ส่ง Proposal หลัง Survey','stage',2880,720,'ELAPSED_MINUTES',
    N'{"hours":48,"anchor":"survey_completed","completion":"latest_forward_order_transition","appliesToAllGrades":true}'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='DEPOSIT_CLOSE' AND version=4)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'DEPOSIT_CLOSE',4,N'ปิดการขายและรับมัดจำ','stage',4320,1440,'CALENDAR_DAYS',
    N'{"days":3,"anchor":"latest_forward_order_transition","appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE
      WHEN policy_code='PROPOSAL_ROI' AND version=5 THEN 1
      WHEN policy_code='DEPOSIT_CLOSE' AND version=4 THEN 1
      ELSE 0 END,
    updated_at=GETDATE()
WHERE policy_code IN ('PROPOSAL_ROI','DEPOSIT_CLOSE')
  AND is_active<>CASE
      WHEN policy_code='PROPOSAL_ROI' AND version=5 THEN 1
      WHEN policy_code='DEPOSIT_CLOSE' AND version=4 THEN 1
      ELSE 0 END;

DECLARE @latest_order TABLE(
  lead_id INT PRIMARY KEY,
  activity_id BIGINT NOT NULL,
  occurred_at DATETIME2 NOT NULL
);

INSERT @latest_order(lead_id,activity_id,occurred_at)
SELECT l.id,latest.id,latest.created_at
FROM dbo.leads l
CROSS APPLY (
  SELECT TOP 1 a.id,a.created_at
  FROM dbo.lead_activities a
  WHERE a.lead_id=l.id
    AND a.activity_type='status_change'
    AND a.new_status='order'
    AND a.title NOT LIKE N'%rollback%'
    AND a.title NOT LIKE N'%revert%'
    AND a.title NOT LIKE N'%ย้อนกลับ%'
  ORDER BY a.created_at DESC,a.id DESC
) latest
WHERE l.status IN ('order','install','warranty','gridtie','closed');

DECLARE @proposal_changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_completed_at DATETIME2 NULL,
  new_completed_at DATETIME2 NOT NULL,
  old_activity_id BIGINT NULL,
  new_activity_id BIGINT NOT NULL
);

UPDATE si
SET policy_version=5,
    status='completed',
    completed_at=o.occurred_at,
    completion_activity_id=o.activity_id,
    breached_at=CASE WHEN o.occurred_at>si.due_at THEN o.occurred_at ELSE NULL END,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.completionRule','latest_forward_order_transition'),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.completed_at,INSERTED.completed_at,
       DELETED.completion_activity_id,INSERTED.completion_activity_id
INTO @proposal_changed(id,lead_id,old_completed_at,new_completed_at,old_activity_id,new_activity_id)
FROM dbo.lead_sla_instances si
JOIN @latest_order o ON o.lead_id=si.lead_id
WHERE si.policy_code='PROPOSAL_ROI'
  AND si.status NOT IN ('cancelled','superseded')
  AND (si.policy_version<>5
    OR ISNULL(si.completed_at,'19000101')<>o.occurred_at
    OR ISNULL(si.completion_activity_id,-1)<>o.activity_id
    OR ISNULL(JSON_VALUE(si.context_json,'$.completionRule'),'')<>'latest_forward_order_transition');

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'completion_changed',
       CONCAT('sla-completion-latest-order:',c.id,':',c.new_activity_id),
       'completed','completed',GETDATE(),
       CONCAT(N'{"rule":"latest_forward_order_transition","fromCompletedAt":"',
              COALESCE(CONVERT(VARCHAR(33),c.old_completed_at,126),''),
              N'","toCompletedAt":"',CONVERT(VARCHAR(33),c.new_completed_at,126),
              N'","fromCompletionActivityId":',COALESCE(CONVERT(VARCHAR(30),c.old_activity_id),'null'),
              N',"toCompletionActivityId":',CONVERT(VARCHAR(30),c.new_activity_id),N'}')
FROM @proposal_changed c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-completion-latest-order:',c.id,':',c.new_activity_id)
);

-- A policy-version/context refresh is not a milestone correction when the
-- timestamp and evidence activity were already identical.
DELETE e
FROM dbo.lead_sla_events e
WHERE e.event_key LIKE 'sla-completion-latest-order:%'
  AND JSON_VALUE(e.detail_json,'$.fromCompletedAt')=JSON_VALUE(e.detail_json,'$.toCompletedAt')
  AND ISNULL(JSON_VALUE(e.detail_json,'$.fromCompletionActivityId'),'null')
      =ISNULL(JSON_VALUE(e.detail_json,'$.toCompletionActivityId'),'null');

DECLARE @deposit_changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_started_at DATETIME2 NOT NULL,
  new_started_at DATETIME2 NOT NULL,
  new_activity_id BIGINT NOT NULL
);

UPDATE si
SET policy_version=4,
    started_at=o.occurred_at,
    target_at=DATEADD(DAY,3,o.occurred_at),
    due_at=DATEADD(DAY,3,o.occurred_at),
    warning_at=DATEADD(DAY,2,o.occurred_at),
    status=CASE
      WHEN si.completed_at IS NOT NULL THEN 'completed'
      WHEN GETDATE()>DATEADD(DAY,3,o.occurred_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(DAY,3,o.occurred_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(DAY,2,o.occurred_at) THEN 'warning'
      ELSE 'active' END,
    breached_at=CASE
      WHEN si.completed_at IS NOT NULL AND si.completed_at>DATEADD(DAY,3,o.occurred_at) THEN si.completed_at
      WHEN si.completed_at IS NULL AND GETDATE()>DATEADD(DAY,3,o.occurred_at) THEN COALESCE(si.breached_at,GETDATE())
      ELSE NULL END,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource','latest_forward_order_transition'),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.started_at,INSERTED.started_at,o.activity_id
INTO @deposit_changed(id,lead_id,old_started_at,new_started_at,new_activity_id)
FROM dbo.lead_sla_instances si
JOIN @latest_order o ON o.lead_id=si.lead_id
WHERE si.policy_code='DEPOSIT_CLOSE'
  AND si.status NOT IN ('cancelled','superseded')
  AND (si.policy_version<>4
    OR si.started_at<>o.occurred_at
    OR ISNULL(JSON_VALUE(si.context_json,'$.anchorSource'),'')<>'latest_forward_order_transition');

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'anchor_changed',
       CONCAT('sla-anchor-latest-order:',c.id,':',c.new_activity_id),
       NULL,NULL,GETDATE(),
       CONCAT(N'{"rule":"latest_forward_order_transition","from":"',
              CONVERT(VARCHAR(33),c.old_started_at,126),
              N'","to":"',CONVERT(VARCHAR(33),c.new_started_at,126),
              N'","activityId":',CONVERT(VARCHAR(30),c.new_activity_id),N'}')
FROM @deposit_changed c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-anchor-latest-order:',c.id,':',c.new_activity_id)
);

DELETE e
FROM dbo.lead_sla_events e
WHERE e.event_key LIKE 'sla-anchor-latest-order:%'
  AND JSON_VALUE(e.detail_json,'$.from')=JSON_VALUE(e.detail_json,'$.to');
