-- 169: Warranty issuance completes CLOSE_LEAD at the same timestamp.
--
-- Version 3 incorrectly opened the clock at warranty issuance and waited for a
-- later workflow status=closed event. The confirmed business rule is instead:
--   start      = installation completion
--   deadline   = start + 3 calendar days
--   completion = warranty issuance (also the displayed Close Lead time)
-- Grid-Tie remains a parallel workflow and does not keep this SLA open.
--
-- Forward-only and idempotent. Recalculates every operational CLOSE_LEAD row
-- from durable lead/activity evidence and restores open rows awaiting warranty.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='CLOSE_LEAD' AND version=4)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'CLOSE_LEAD',4,N'ปิด Lead เมื่อออกใบรับประกัน','stage',4320,1440,'INSTALLATION_TO_WARRANTY',
    N'{"days":3,"anchor":"installation_completed","completion":"warranty_issued","closeLeadAtWarrantyIssued":true,"appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=4 THEN 1 ELSE 0 END,updated_at=GETDATE()
WHERE policy_code='CLOSE_LEAD'
  AND is_active<>CASE WHEN version=4 THEN 1 ELSE 0 END;

IF OBJECT_ID('tempdb..#close_lead_v4') IS NOT NULL
  DROP TABLE #close_lead_v4;

;WITH milestones AS (
  SELECT l.id AS lead_id,l.assigned_user_id,l.status AS lead_status,
         CASE
           WHEN l.install_actual_date IS NOT NULL AND l.install_completed_at IS NOT NULL
                AND CAST(l.install_actual_date AS DATE)=CAST(l.install_completed_at AS DATE)
             THEN l.install_completed_at
           WHEN l.install_actual_date IS NOT NULL
             THEN DATEADD(SECOND,86399,CAST(CAST(l.install_actual_date AS DATE) AS DATETIME2))
           ELSE l.install_completed_at
         END AS install_completed_at,
         COALESCE(warranty.created_at,l.warranty_issued_at) AS warranty_issued_at,
         warranty.id AS warranty_activity_id
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 a.id,a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id=l.id AND a.activity_type='warranty'
    ORDER BY a.created_at,a.id
  ) warranty
), eligible AS (
  SELECT m.lead_id,m.assigned_user_id,m.install_completed_at AS anchor_at,
         CASE WHEN m.warranty_issued_at>=m.install_completed_at
                THEN m.warranty_issued_at ELSE NULL END AS completed_at,
         CASE WHEN m.warranty_issued_at>=m.install_completed_at
                THEN m.warranty_activity_id ELSE NULL END AS completion_activity_id
  FROM milestones m
  WHERE m.install_completed_at IS NOT NULL
    AND m.lead_status IN ('warranty','gridtie','closed')
)
SELECT lead_id,assigned_user_id,anchor_at,completed_at,completion_activity_id
INTO #close_lead_v4
FROM eligible;

DECLARE @updated TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_policy_version INT NULL,
  old_started_at DATETIME2 NULL,
  new_started_at DATETIME2 NOT NULL,
  old_due_at DATETIME2 NULL,
  new_due_at DATETIME2 NOT NULL,
  old_status NVARCHAR(30) NULL,
  new_status NVARCHAR(30) NULL,
  completed_at DATETIME2 NULL
);

UPDATE si
SET policy_version=4,
    task_name=N'ปิด Lead เมื่อออกใบรับประกัน',
    owner_user_id=d.assigned_user_id,
    owner_role='sales',
    started_at=d.anchor_at,
    target_at=DATEADD(MINUTE,4320,d.anchor_at),
    due_at=DATEADD(MINUTE,4320,d.anchor_at),
    warning_at=DATEADD(MINUTE,2880,d.anchor_at),
    status=CASE
      WHEN d.completed_at IS NOT NULL THEN 'completed'
      WHEN GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,4320,d.anchor_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,2880,d.anchor_at) THEN 'warning'
      ELSE 'active'
    END,
    completed_at=d.completed_at,
    completion_activity_id=d.completion_activity_id,
    breached_at=CASE
      WHEN d.completed_at IS NOT NULL
        THEN CASE WHEN d.completed_at>DATEADD(MINUTE,4320,d.anchor_at) THEN d.completed_at ELSE NULL END
      WHEN GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN COALESCE(si.breached_at,GETDATE())
      ELSE NULL
    END,
    context_json=JSON_MODIFY(
      JSON_MODIFY(
        JSON_MODIFY(
          JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource','installation_completed'),
          '$.completionSource','warranty_issued'
        ),
        '$.closeLeadAtWarrantyIssued',1
      ),
      '$.cancellationReason',NULL
    ),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.policy_version,DELETED.started_at,
       INSERTED.started_at,DELETED.due_at,INSERTED.due_at,DELETED.status,
       INSERTED.status,INSERTED.completed_at
INTO @updated(id,lead_id,old_policy_version,old_started_at,new_started_at,old_due_at,new_due_at,old_status,new_status,completed_at)
FROM dbo.lead_sla_instances si
JOIN #close_lead_v4 d ON d.lead_id=si.lead_id
WHERE si.instance_key=CONCAT('operational:close_lead:',si.lead_id);

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT u.id,u.lead_id,'anchor_changed',
       CONCAT('sla-anchor-changed:',u.id,':installation-to-warranty-v1'),
       u.old_status,u.new_status,GETDATE(),
       CONCAT(N'{"rule":"installation_to_warranty_v1","from":"',
              CONVERT(VARCHAR(33),u.old_started_at,126),N'","to":"',
              CONVERT(VARCHAR(33),u.new_started_at,126),N'"}')
FROM @updated u
WHERE ISNULL(u.old_started_at,'19000101')<>u.new_started_at
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-anchor-changed:',u.id,':installation-to-warranty-v1')
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT u.id,u.lead_id,'policy_changed',
       CONCAT('sla-policy-changed:',u.id,':close-lead-v4'),
       u.old_status,u.new_status,GETDATE(),
       CONCAT(N'{"policyVersion":4,"days":3,"completion":"warranty_issued","oldDueAt":"',
              CONVERT(VARCHAR(33),u.old_due_at,126),N'","newDueAt":"',
              CONVERT(VARCHAR(33),u.new_due_at,126),N'"}')
FROM @updated u
WHERE (ISNULL(u.old_policy_version,0)<>4 OR ISNULL(u.old_due_at,'19000101')<>u.new_due_at)
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-policy-changed:',u.id,':close-lead-v4')
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT u.id,u.lead_id,'completed',
       CONCAT('sla-completed:',u.id,':warranty-issued-v1'),
       u.old_status,'completed',u.completed_at,
       N'{"policyCode":"CLOSE_LEAD","completionSource":"warranty_issued","closeLeadAtWarrantyIssued":true}'
FROM @updated u
WHERE u.completed_at IS NOT NULL
  AND u.old_status<>'completed'
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-completed:',u.id,':warranty-issued-v1')
  );

DECLARE @inserted TABLE(id BIGINT NOT NULL,lead_id INT NOT NULL,status NVARCHAR(30) NULL,completed_at DATETIME2 NULL);

INSERT dbo.lead_sla_instances(
  lead_id,policy_code,policy_version,instance_key,task_name,owner_user_id,owner_role,
  started_at,target_at,due_at,warning_at,status,completed_at,completion_activity_id,
  breached_at,context_json
)
OUTPUT INSERTED.id,INSERTED.lead_id,INSERTED.status,INSERTED.completed_at
INTO @inserted(id,lead_id,status,completed_at)
SELECT d.lead_id,'CLOSE_LEAD',4,CONCAT('operational:close_lead:',d.lead_id),
       N'ปิด Lead เมื่อออกใบรับประกัน',d.assigned_user_id,'sales',
       d.anchor_at,DATEADD(MINUTE,4320,d.anchor_at),DATEADD(MINUTE,4320,d.anchor_at),
       DATEADD(MINUTE,2880,d.anchor_at),
       CASE
         WHEN d.completed_at IS NOT NULL THEN 'completed'
         WHEN GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN 'breached'
         WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,4320,d.anchor_at))<=30 THEN 'critical'
         WHEN GETDATE()>=DATEADD(MINUTE,2880,d.anchor_at) THEN 'warning'
         ELSE 'active'
       END,
       d.completed_at,d.completion_activity_id,
       CASE
         WHEN d.completed_at>DATEADD(MINUTE,4320,d.anchor_at) THEN d.completed_at
         WHEN d.completed_at IS NULL AND GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN GETDATE()
         ELSE NULL
       END,
       N'{"operational":true,"calendarDays":true,"timezone":"Asia/Bangkok","anchorSource":"installation_completed","completionSource":"warranty_issued","closeLeadAtWarrantyIssued":true}'
FROM #close_lead_v4 d
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_instances si
  WHERE si.instance_key=CONCAT('operational:close_lead:',d.lead_id)
);

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,to_status,event_at,detail_json
)
SELECT i.id,i.lead_id,'created',CONCAT('sla-created:operational:close_lead:',i.lead_id),
       i.status,si.started_at,
       CONCAT(N'{"policyCode":"CLOSE_LEAD","targetAt":"',
              CONVERT(VARCHAR(33),si.target_at,126),N'","dueAt":"',
              CONVERT(VARCHAR(33),si.due_at,126),N'"}')
FROM @inserted i
JOIN dbo.lead_sla_instances si ON si.id=i.id
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-created:operational:close_lead:',i.lead_id)
);

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT i.id,i.lead_id,'completed',CONCAT('sla-completed:',i.id,':warranty-issued-v1'),
       'active','completed',i.completed_at,
       N'{"policyCode":"CLOSE_LEAD","completionSource":"warranty_issued","closeLeadAtWarrantyIssued":true}'
FROM @inserted i
WHERE i.completed_at IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-completed:',i.id,':warranty-issued-v1')
  );

DECLARE @cancelled TABLE(id BIGINT NOT NULL,lead_id INT NOT NULL,old_status NVARCHAR(30) NULL);

UPDATE si
SET status='cancelled',completed_at=NULL,completion_activity_id=NULL,breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.cancellationReason','workflow_rolled_back_before_warranty_stage'),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.status
INTO @cancelled(id,lead_id,old_status)
FROM dbo.lead_sla_instances si
LEFT JOIN #close_lead_v4 d ON d.lead_id=si.lead_id
WHERE si.policy_code='CLOSE_LEAD'
  AND si.instance_key=CONCAT('operational:close_lead:',si.lead_id)
  AND si.status NOT IN ('cancelled','superseded')
  AND d.lead_id IS NULL;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'cancelled',
       CONCAT('sla-cancelled:',c.id,':before-warranty-stage-v1'),
       c.old_status,'cancelled',GETDATE(),
       N'{"rule":"installation_to_warranty_v1","reason":"workflow_rolled_back_before_warranty_stage"}'
FROM @cancelled c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':before-warranty-stage-v1')
);

DROP TABLE #close_lead_v4;
