-- 172: CONTACT_RETRY starts each rung from the preceding real attempt.
--
-- Version 1 used one shared first-failure anchor for Day 3/5/7/30 and opened
-- all four rows together. Version 2 is sequential: only the current rung exists
-- as open work; completing it as unreachable starts the next rung at that exact
-- activity time. Future legacy rows are superseded, never deleted.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @now DATETIME2 = GETDATE();

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='CONTACT_RETRY' AND version=2)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'CONTACT_RETRY',2,N'ติดตามเมื่อติดต่อไม่ได้','playbook',NULL,1440,'SEQUENTIAL_CALENDAR_DAYS',
    N'{"daysBySequence":[3,5,7,30],"anchor":"previous_attempt_completed_at","oneOpenAtATime":true,"calendarDays":true,"timezone":"Asia/Bangkok"}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=2 THEN 1 ELSE 0 END,updated_at=@now
WHERE policy_code='CONTACT_RETRY'
  AND is_active<>CASE WHEN version=2 THEN 1 ELSE 0 END;

DECLARE @targets TABLE(
  lead_id INT PRIMARY KEY,
  owner_user_id INT NULL,
  first_activity_id INT NOT NULL,
  first_failed_at DATETIME2 NOT NULL
);

;WITH first_rung AS (
  SELECT si.lead_id,si.owner_user_id,si.started_at,
         TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.anchorActivityId')) AS first_activity_id,
         ROW_NUMBER() OVER(PARTITION BY si.lead_id ORDER BY si.id) AS rn
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code='CONTACT_RETRY'
    AND TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.sequence'))=1
)
INSERT @targets(lead_id,owner_user_id,first_activity_id,first_failed_at)
SELECT lead_id,owner_user_id,first_activity_id,started_at
FROM first_rung
WHERE rn=1 AND first_activity_id IS NOT NULL;

DECLARE @attempts TABLE(
  lead_id INT NOT NULL,
  sequence INT NOT NULL,
  activity_id INT NOT NULL,
  completed_at DATETIME2 NOT NULL,
  terminal_result BIT NOT NULL,
  PRIMARY KEY(lead_id,sequence)
);

;WITH contact_attempt AS (
  SELECT t.lead_id,a.id AS activity_id,a.created_at,
         CASE WHEN a.contact_result IN ('connected','invalid_contact')
                   OR a.title LIKE N'ติดต่อได้%'
                   OR a.title LIKE N'%ข้อมูลติดต่อไม่ถูกต้อง%'
                THEN 1 ELSE 0 END AS terminal_result,
         ROW_NUMBER() OVER(PARTITION BY t.lead_id ORDER BY a.created_at,a.id) AS sequence
  FROM @targets t
  JOIN dbo.lead_activities a
    ON a.lead_id=t.lead_id
   AND a.activity_type IN ('call','visit','line','other','follow_up')
   AND (a.created_at>t.first_failed_at OR (a.created_at=t.first_failed_at AND a.id>t.first_activity_id))
   AND (a.contact_result IS NOT NULL
        OR a.title LIKE N'ติดต่อได้%'
        OR a.title LIKE N'ติดต่อไม่ได้%')
), before_terminal AS (
  SELECT a.*,
         SUM(a.terminal_result) OVER(
           PARTITION BY a.lead_id ORDER BY a.sequence
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS prior_terminal_count
  FROM contact_attempt a
)
INSERT @attempts(lead_id,sequence,activity_id,completed_at,terminal_result)
SELECT lead_id,sequence,activity_id,created_at,terminal_result
FROM before_terminal
WHERE sequence<=4 AND ISNULL(prior_terminal_count,0)=0;

DECLARE @desired TABLE(
  lead_id INT NOT NULL,
  sequence INT NOT NULL,
  offset_days INT NOT NULL,
  owner_user_id INT NULL,
  anchor_activity_id INT NOT NULL,
  started_at DATETIME2 NOT NULL,
  due_at DATETIME2 NOT NULL,
  warning_at DATETIME2 NOT NULL,
  status NVARCHAR(30) NOT NULL,
  completed_at DATETIME2 NULL,
  completion_activity_id INT NULL,
  breached_at DATETIME2 NULL,
  instance_key NVARCHAR(255) NOT NULL,
  context_json NVARCHAR(MAX) NOT NULL,
  PRIMARY KEY(lead_id,sequence)
);

;WITH rung AS (
  SELECT 1 AS sequence,3 AS offset_days UNION ALL
  SELECT 2,5 UNION ALL
  SELECT 3,7 UNION ALL
  SELECT 4,30
), stats AS (
  SELECT t.lead_id,t.owner_user_id,t.first_activity_id,t.first_failed_at,
         MAX(a.sequence) AS attempt_count,
         MIN(CASE WHEN a.terminal_result=1 THEN a.sequence END) AS terminal_sequence
  FROM @targets t
  LEFT JOIN @attempts a ON a.lead_id=t.lead_id
  GROUP BY t.lead_id,t.owner_user_id,t.first_activity_id,t.first_failed_at
), ladder AS (
  SELECT s.lead_id,s.owner_user_id,r.sequence,r.offset_days,
         CASE WHEN r.sequence=1 THEN s.first_activity_id ELSE previous_attempt.activity_id END AS anchor_activity_id,
         CASE WHEN r.sequence=1 THEN s.first_failed_at ELSE previous_attempt.completed_at END AS started_at,
         current_attempt.activity_id AS completion_activity_id,
         current_attempt.completed_at,
         s.terminal_sequence,
         CASE WHEN s.terminal_sequence IS NOT NULL THEN s.terminal_sequence
              WHEN ISNULL(s.attempt_count,0)>=4 THEN 4
              ELSE ISNULL(s.attempt_count,0)+1 END AS max_sequence
  FROM stats s
  CROSS JOIN rung r
  LEFT JOIN @attempts previous_attempt
    ON previous_attempt.lead_id=s.lead_id AND previous_attempt.sequence=r.sequence-1
  LEFT JOIN @attempts current_attempt
    ON current_attempt.lead_id=s.lead_id AND current_attempt.sequence=r.sequence
), timed AS (
  SELECT l.*,
         DATEADD(DAY,l.offset_days,l.started_at) AS due_at,
         DATEADD(DAY,l.offset_days-1,l.started_at) AS warning_at
  FROM ladder l
  WHERE l.sequence<=l.max_sequence AND l.started_at IS NOT NULL AND l.anchor_activity_id IS NOT NULL
)
INSERT @desired(
  lead_id,sequence,offset_days,owner_user_id,anchor_activity_id,started_at,due_at,warning_at,
  status,completed_at,completion_activity_id,breached_at,instance_key,context_json
)
SELECT t.lead_id,t.sequence,t.offset_days,t.owner_user_id,t.anchor_activity_id,
       t.started_at,t.due_at,t.warning_at,
       CASE WHEN t.completion_activity_id IS NOT NULL THEN 'completed'
            WHEN @now>t.due_at THEN 'breached'
            WHEN DATEDIFF(MINUTE,@now,t.due_at)<=30 THEN 'critical'
            WHEN @now>=t.warning_at THEN 'warning'
            ELSE 'active' END,
       t.completed_at,t.completion_activity_id,
       CASE WHEN t.completion_activity_id IS NOT NULL AND t.completed_at>t.due_at THEN t.completed_at
            WHEN t.completion_activity_id IS NULL AND @now>t.due_at THEN @now
            ELSE NULL END,
       CONCAT('contact-retry:',t.lead_id,':d',t.offset_days,':',t.anchor_activity_id),
       CONCAT('{"sequence":',t.sequence,
              ',"offsetDays":',t.offset_days,
              ',"anchorActivityId":',t.anchor_activity_id,
              ',"sequentialActualStart":true,"convertedBy":"migration_172"}')
FROM timed t;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  sequence INT NOT NULL,
  old_status NVARCHAR(30) NULL,
  new_status NVARCHAR(30) NULL,
  old_started_at DATETIME2 NULL,
  new_started_at DATETIME2 NULL
);

UPDATE si
SET policy_version=2,
    instance_key=d.instance_key,
    task_name=CONCAT(N'ติดตามลูกค้าครั้งที่ ',d.sequence),
    owner_user_id=d.owner_user_id,
    owner_role='sales',
    started_at=d.started_at,
    target_at=d.due_at,
    due_at=d.due_at,
    warning_at=d.warning_at,
    status=d.status,
    completed_at=d.completed_at,
    completion_activity_id=d.completion_activity_id,
    breached_at=CASE WHEN d.status='breached' THEN COALESCE(si.breached_at,d.breached_at)
                     ELSE d.breached_at END,
    superseded_at=NULL,
    context_json=d.context_json,
    updated_at=@now
OUTPUT INSERTED.id,INSERTED.lead_id,d.sequence,DELETED.status,INSERTED.status,
       DELETED.started_at,INSERTED.started_at
INTO @changed(id,lead_id,sequence,old_status,new_status,old_started_at,new_started_at)
FROM dbo.lead_sla_instances si
JOIN @desired d
  ON d.lead_id=si.lead_id
 AND d.sequence=TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.sequence'))
WHERE si.policy_version<>2
   OR si.instance_key<>d.instance_key
   OR si.started_at<>d.started_at
   OR si.target_at<>d.due_at
   OR si.due_at<>d.due_at
   OR si.warning_at<>d.warning_at
   OR si.status<>d.status
   OR ISNULL(si.completed_at,'19000101')<>ISNULL(d.completed_at,'19000101')
   OR ISNULL(si.completion_activity_id,-1)<>ISNULL(d.completion_activity_id,-1)
   OR ISNULL(si.breached_at,'19000101')<>ISNULL(
        CASE WHEN d.status='breached' THEN COALESCE(si.breached_at,d.breached_at) ELSE d.breached_at END,
        '19000101'
      )
   OR si.superseded_at IS NOT NULL
   OR ISNULL(JSON_VALUE(si.context_json,'$.sequentialActualStart'),'false')<>'true';

DECLARE @created TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  sequence INT NOT NULL,
  instance_key NVARCHAR(255) NOT NULL,
  status NVARCHAR(30) NOT NULL,
  started_at DATETIME2 NOT NULL,
  completed_at DATETIME2 NULL,
  completion_activity_id INT NULL
);

INSERT dbo.lead_sla_instances(
  lead_id,policy_code,policy_version,instance_key,task_name,owner_user_id,owner_role,
  started_at,target_at,due_at,warning_at,status,completed_at,completion_activity_id,
  breached_at,context_json
)
OUTPUT INSERTED.id,INSERTED.lead_id,
       TRY_CONVERT(INT,JSON_VALUE(INSERTED.context_json,'$.sequence')),
       INSERTED.instance_key,INSERTED.status,INSERTED.started_at,
       INSERTED.completed_at,INSERTED.completion_activity_id
INTO @created(id,lead_id,sequence,instance_key,status,started_at,completed_at,completion_activity_id)
SELECT d.lead_id,'CONTACT_RETRY',2,d.instance_key,
       CONCAT(N'ติดตามลูกค้าครั้งที่ ',d.sequence),
       d.owner_user_id,'sales',d.started_at,d.due_at,d.due_at,d.warning_at,
       d.status,d.completed_at,d.completion_activity_id,d.breached_at,d.context_json
FROM @desired d
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_instances si
  WHERE si.lead_id=d.lead_id
    AND si.policy_code='CONTACT_RETRY'
    AND TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.sequence'))=d.sequence
);

DECLARE @superseded TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  sequence INT NULL,
  old_status NVARCHAR(30) NULL
);

UPDATE si
SET status='superseded',completed_at=NULL,completion_activity_id=NULL,
    breached_at=NULL,superseded_at=COALESCE(si.superseded_at,@now),
    context_json=JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.supersededBy','migration_172'),
      '$.supersededReason','sequential_not_started'
    ),
    updated_at=@now
OUTPUT INSERTED.id,INSERTED.lead_id,
       TRY_CONVERT(INT,JSON_VALUE(INSERTED.context_json,'$.sequence')),
       DELETED.status
INTO @superseded(id,lead_id,sequence,old_status)
FROM dbo.lead_sla_instances si
JOIN @targets t ON t.lead_id=si.lead_id
WHERE si.policy_code='CONTACT_RETRY'
  AND si.status<>'superseded'
  AND NOT EXISTS(
    SELECT 1 FROM @desired d
    WHERE d.lead_id=si.lead_id
      AND d.sequence=TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.sequence'))
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'created',CONCAT('sla-created:',c.instance_key),
       c.status,c.started_at,
       CONCAT(N'{"source":"migration_172_sequential_start","sequence":',c.sequence,N'}')
FROM @created c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-created:',c.instance_key)
);

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'anchor_changed',
       CONCAT('sla-anchor-changed:',c.id,':contact-retry-sequential-v2'),
       c.old_status,c.new_status,@now,
       CONCAT(N'{"rule":"contact_retry_sequential_v2","sequence":',c.sequence,
              N',"from":"',CONVERT(VARCHAR(33),c.old_started_at,126),
              N'","to":"',CONVERT(VARCHAR(33),c.new_started_at,126),N'"}')
FROM @changed c
WHERE c.old_started_at<>c.new_started_at
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-anchor-changed:',c.id,':contact-retry-sequential-v2')
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT s.id,s.lead_id,'superseded',
       CONCAT('sla-superseded:',s.id,':contact-retry-sequential-v2'),
       s.old_status,'superseded',@now,
       CONCAT(N'{"rule":"contact_retry_sequential_v2","sequence":',s.sequence,
              N',"reason":"sequential_not_started"}')
FROM @superseded s
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-superseded:',s.id,':contact-retry-sequential-v2')
);

;WITH next_open AS (
  SELECT t.lead_id,MIN(si.due_at) AS next_due_at
  FROM @targets t
  LEFT JOIN dbo.lead_sla_instances si
    ON si.lead_id=t.lead_id
   AND si.policy_code='CONTACT_RETRY'
   AND si.status IN ('active','warning','critical','breached')
  GROUP BY t.lead_id
)
UPDATE l
SET next_follow_up=CAST(n.next_due_at AS DATE),updated_at=@now
FROM dbo.leads l
JOIN next_open n ON n.lead_id=l.id
WHERE ISNULL(l.next_follow_up,'19000101')<>ISNULL(CAST(n.next_due_at AS DATE),'19000101');
