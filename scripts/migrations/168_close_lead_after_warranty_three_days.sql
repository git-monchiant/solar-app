-- 168: CLOSE_LEAD starts only after installation and warranty issuance.
--
-- The old seven-day clock opened as soon as installation ended, so Timeline
-- displayed "ปิด Lead" before "ออกใบรับประกัน". Version 3 opens at the later
-- of the two durable milestones and allows three calendar days to close the
-- lead. Open clocks without a warranty milestone are cancelled.
--
-- Forward-only and idempotent. Existing operational rows are recalculated from
-- durable lead/activity evidence; missing eligible rows are created.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='CLOSE_LEAD' AND version=3)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'CLOSE_LEAD',3,N'ปิด Lead หลังออกใบรับประกัน','stage',4320,1440,'WARRANTY_ISSUED',
    N'{"days":3,"anchor":"later_of_installation_completed_or_warranty_issued","requiresWarranty":true,"appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=3 THEN 1 ELSE 0 END, updated_at=GETDATE()
WHERE policy_code='CLOSE_LEAD'
  AND is_active<>CASE WHEN version=3 THEN 1 ELSE 0 END;

IF OBJECT_ID('tempdb..#close_lead_desired') IS NOT NULL
  DROP TABLE #close_lead_desired;

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
         closed.id AS closed_activity_id,closed.created_at AS closed_at
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 a.id,a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id=l.id AND a.activity_type='warranty'
    ORDER BY a.created_at,a.id
  ) warranty
  OUTER APPLY (
    SELECT TOP 1 a.id,a.created_at
    FROM dbo.lead_activities a
    WHERE a.lead_id=l.id AND a.activity_type='status_change' AND a.new_status='closed'
    ORDER BY a.created_at,a.id
  ) closed
), eligible AS (
  SELECT m.*,
         CASE WHEN m.warranty_issued_at>m.install_completed_at
                THEN m.warranty_issued_at ELSE m.install_completed_at END AS anchor_at
  FROM milestones m
  WHERE m.install_completed_at IS NOT NULL
    AND m.warranty_issued_at IS NOT NULL
    AND (m.lead_status IN ('gridtie','closed') OR m.closed_at IS NOT NULL)
)
SELECT lead_id,assigned_user_id,anchor_at,closed_activity_id,closed_at
INTO #close_lead_desired
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
  new_status NVARCHAR(30) NULL
);

UPDATE si
SET policy_version=3,
    task_name=N'ปิด Lead หลังออกใบรับประกัน',
    owner_user_id=d.assigned_user_id,
    owner_role='sales',
    started_at=d.anchor_at,
    target_at=DATEADD(MINUTE,4320,d.anchor_at),
    due_at=DATEADD(MINUTE,4320,d.anchor_at),
    warning_at=DATEADD(MINUTE,2880,d.anchor_at),
    status=CASE
      WHEN d.closed_at IS NOT NULL THEN 'completed'
      WHEN GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,4320,d.anchor_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,2880,d.anchor_at) THEN 'warning'
      ELSE 'active'
    END,
    completed_at=d.closed_at,
    completion_activity_id=d.closed_activity_id,
    breached_at=CASE
      WHEN d.closed_at IS NOT NULL
        THEN CASE WHEN d.closed_at>DATEADD(MINUTE,4320,d.anchor_at) THEN d.closed_at ELSE NULL END
      WHEN GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN COALESCE(si.breached_at,GETDATE())
      ELSE NULL
    END,
    context_json=JSON_MODIFY(
      JSON_MODIFY(
        JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource','installation_and_warranty_completed'),
        '$.warrantyBeforeClose',1
      ),
      '$.cancellationReason',NULL
    ),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.policy_version,DELETED.started_at,
       INSERTED.started_at,DELETED.due_at,INSERTED.due_at,DELETED.status,INSERTED.status
INTO @updated(id,lead_id,old_policy_version,old_started_at,new_started_at,old_due_at,new_due_at,old_status,new_status)
FROM dbo.lead_sla_instances si
JOIN #close_lead_desired d ON d.lead_id=si.lead_id
WHERE si.instance_key=CONCAT('operational:close_lead:',si.lead_id);

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT u.id,u.lead_id,'anchor_changed',
       CONCAT('sla-anchor-changed:',u.id,':warranty-before-close-v1'),
       u.old_status,u.new_status,GETDATE(),
       CONCAT(N'{"rule":"warranty_before_close_v1","from":"',
              CONVERT(VARCHAR(33),u.old_started_at,126),N'","to":"',
              CONVERT(VARCHAR(33),u.new_started_at,126),N'"}')
FROM @updated u
WHERE ISNULL(u.old_started_at,'19000101')<>u.new_started_at
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-anchor-changed:',u.id,':warranty-before-close-v1')
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT u.id,u.lead_id,'policy_changed',
       CONCAT('sla-policy-changed:',u.id,':close-lead-v3'),
       u.old_status,u.new_status,GETDATE(),
       CONCAT(N'{"policyVersion":3,"days":3,"oldDueAt":"',
              CONVERT(VARCHAR(33),u.old_due_at,126),N'","newDueAt":"',
              CONVERT(VARCHAR(33),u.new_due_at,126),N'"}')
FROM @updated u
WHERE (ISNULL(u.old_policy_version,0)<>3 OR ISNULL(u.old_due_at,'19000101')<>u.new_due_at)
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-policy-changed:',u.id,':close-lead-v3')
  );

DECLARE @inserted TABLE(id BIGINT NOT NULL,lead_id INT NOT NULL,status NVARCHAR(30) NULL);

INSERT dbo.lead_sla_instances(
  lead_id,policy_code,policy_version,instance_key,task_name,owner_user_id,owner_role,
  started_at,target_at,due_at,warning_at,status,completed_at,completion_activity_id,
  breached_at,context_json
)
OUTPUT INSERTED.id,INSERTED.lead_id,INSERTED.status INTO @inserted(id,lead_id,status)
SELECT d.lead_id,'CLOSE_LEAD',3,CONCAT('operational:close_lead:',d.lead_id),
       N'ปิด Lead หลังออกใบรับประกัน',d.assigned_user_id,'sales',
       d.anchor_at,DATEADD(MINUTE,4320,d.anchor_at),DATEADD(MINUTE,4320,d.anchor_at),
       DATEADD(MINUTE,2880,d.anchor_at),
       CASE
         WHEN d.closed_at IS NOT NULL THEN 'completed'
         WHEN GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN 'breached'
         WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,4320,d.anchor_at))<=30 THEN 'critical'
         WHEN GETDATE()>=DATEADD(MINUTE,2880,d.anchor_at) THEN 'warning'
         ELSE 'active'
       END,
       d.closed_at,d.closed_activity_id,
       CASE
         WHEN d.closed_at>DATEADD(MINUTE,4320,d.anchor_at) THEN d.closed_at
         WHEN d.closed_at IS NULL AND GETDATE()>DATEADD(MINUTE,4320,d.anchor_at) THEN GETDATE()
         ELSE NULL
       END,
       N'{"operational":true,"calendarDays":true,"timezone":"Asia/Bangkok","anchorSource":"installation_and_warranty_completed","warrantyBeforeClose":true}'
FROM #close_lead_desired d
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

DECLARE @cancelled TABLE(id BIGINT NOT NULL,lead_id INT NOT NULL,old_status NVARCHAR(30) NULL);

UPDATE si
SET status='cancelled',completed_at=NULL,completion_activity_id=NULL,breached_at=NULL,
    context_json=JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.warrantyBeforeClose',1),
      '$.cancellationReason','warranty_required_before_close'
    ),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.status
INTO @cancelled(id,lead_id,old_status)
FROM dbo.lead_sla_instances si
LEFT JOIN #close_lead_desired d ON d.lead_id=si.lead_id
WHERE si.policy_code='CLOSE_LEAD'
  AND si.instance_key=CONCAT('operational:close_lead:',si.lead_id)
  AND si.status NOT IN ('cancelled','superseded')
  AND d.lead_id IS NULL;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'cancelled',
       CONCAT('sla-cancelled:',c.id,':warranty-required-v1'),
       c.old_status,'cancelled',GETDATE(),
       N'{"rule":"warranty_before_close_v1","reason":"warranty_required_before_close"}'
FROM @cancelled c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':warranty-required-v1')
);

DROP TABLE #close_lead_desired;
