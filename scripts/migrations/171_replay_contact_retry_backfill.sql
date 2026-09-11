-- 171: Restore CONTACT_RETRY rungs skipped by migration 166 and replay history.
--
-- Migration 166 intentionally created only future rungs for four legacy leads.
-- That avoided retroactive verdicts but left Timeline without attempts 1-3 even
-- though the contact activities still exist. Recreate the full Day 3/5/7/30
-- ladder and replay each later contact into the earliest open rung, matching
-- processContactActivity. Restricted to rows tagged by migration 166.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @now DATETIME2 = GETDATE();
DECLARE @targets TABLE(
  lead_id INT PRIMARY KEY,
  owner_user_id INT NULL,
  anchor_activity_id INT NOT NULL,
  anchor_at DATETIME2 NOT NULL
);

;WITH tagged AS (
  SELECT si.lead_id,si.owner_user_id,si.started_at,
         TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.anchorActivityId')) AS anchor_activity_id,
         ROW_NUMBER() OVER(PARTITION BY si.lead_id ORDER BY si.id) AS rn
  FROM dbo.lead_sla_instances si
  WHERE si.policy_code='CONTACT_RETRY'
    AND JSON_VALUE(si.context_json,'$.backfilledBy')='migration_166'
    -- Migration 172 converts this ladder to sequential v2 and changes its
    -- instance keys. If dev migrations are replayed, do not recreate the
    -- retired fixed-anchor v1 ladder or rewrite the v2 statuses.
    AND NOT EXISTS(
      SELECT 1
      FROM dbo.lead_sla_instances v2
      WHERE v2.lead_id=si.lead_id
        AND v2.policy_code='CONTACT_RETRY'
        AND v2.policy_version>=2
        AND JSON_VALUE(v2.context_json,'$.sequentialActualStart')='true'
    )
)
INSERT @targets(lead_id,owner_user_id,anchor_activity_id,anchor_at)
SELECT lead_id,owner_user_id,anchor_activity_id,started_at
FROM tagged
WHERE rn=1 AND anchor_activity_id IS NOT NULL;

DECLARE @created TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  instance_key NVARCHAR(255) NOT NULL,
  started_at DATETIME2 NOT NULL
);

;WITH rung AS (
  SELECT 1 AS sequence,3 AS offset_days UNION ALL
  SELECT 2,5 UNION ALL
  SELECT 3,7 UNION ALL
  SELECT 4,30
), desired AS (
  SELECT t.lead_id,t.owner_user_id,t.anchor_activity_id,t.anchor_at,
         r.sequence,r.offset_days,
         DATEADD(DAY,r.offset_days,t.anchor_at) AS due_at,
         DATEADD(DAY,r.offset_days-1,t.anchor_at) AS warning_at,
         CONCAT('contact-retry:',t.lead_id,':d',r.offset_days,':',t.anchor_activity_id) AS instance_key
  FROM @targets t CROSS JOIN rung r
)
INSERT dbo.lead_sla_instances(
  lead_id,policy_code,policy_version,instance_key,task_name,owner_user_id,owner_role,
  started_at,target_at,due_at,warning_at,status,context_json
)
OUTPUT INSERTED.id,INSERTED.lead_id,INSERTED.instance_key,INSERTED.started_at
INTO @created(id,lead_id,instance_key,started_at)
SELECT d.lead_id,'CONTACT_RETRY',1,d.instance_key,
       CONCAT(N'ติดตามลูกค้าครั้งที่ ',d.sequence,N' (Day ',d.offset_days,N')'),
       d.owner_user_id,'sales',d.anchor_at,d.due_at,d.due_at,d.warning_at,'active',
       CONCAT('{"sequence":',d.sequence,
              ',"offsetDays":',d.offset_days,
              ',"anchorActivityId":',d.anchor_activity_id,
              ',"backfilledBy":"migration_166"',
              ',"backfillHistoryReplayedBy":"migration_171"',
              ',"pastRungsSkipped":false}')
FROM desired d
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_instances si WHERE si.instance_key=d.instance_key
);

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'created',CONCAT('sla-created:',c.instance_key),
       'active',c.started_at,N'{"source":"migration_171_contact_retry_history"}'
FROM @created c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-created:',c.instance_key)
);

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
   AND (a.created_at>t.anchor_at OR (a.created_at=t.anchor_at AND a.id>t.anchor_activity_id))
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

DECLARE @terminal TABLE(lead_id INT PRIMARY KEY,terminal_sequence INT NOT NULL);
INSERT @terminal(lead_id,terminal_sequence)
SELECT lead_id,MIN(sequence)
FROM @attempts
WHERE terminal_result=1
GROUP BY lead_id;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  sequence INT NOT NULL,
  old_status NVARCHAR(30) NULL,
  new_status NVARCHAR(30) NULL,
  old_completed_at DATETIME2 NULL,
  new_completed_at DATETIME2 NULL,
  new_activity_id INT NULL
);

;WITH source AS (
  SELECT si.id,si.lead_id,si.status,si.completed_at,si.completion_activity_id,
         si.due_at,si.warning_at,si.breached_at,si.context_json,
         TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.sequence')) AS sequence,
         a.activity_id,a.completed_at AS activity_completed_at,
         terminal.terminal_sequence
  FROM dbo.lead_sla_instances si
  JOIN @targets t ON t.lead_id=si.lead_id
  LEFT JOIN @attempts a
    ON a.lead_id=si.lead_id
   AND a.sequence=TRY_CONVERT(INT,JSON_VALUE(si.context_json,'$.sequence'))
  LEFT JOIN @terminal terminal ON terminal.lead_id=si.lead_id
  WHERE si.policy_code='CONTACT_RETRY'
    AND JSON_VALUE(si.context_json,'$.backfilledBy')='migration_166'
), desired AS (
  SELECT s.*,
         CASE
           WHEN s.activity_id IS NOT NULL THEN 'completed'
           WHEN s.terminal_sequence IS NOT NULL AND s.sequence>s.terminal_sequence THEN 'cancelled'
           WHEN @now>s.due_at THEN 'breached'
           WHEN DATEDIFF(MINUTE,@now,s.due_at)<=30 THEN 'critical'
           WHEN @now>=s.warning_at THEN 'warning'
           ELSE 'active'
         END AS desired_status,
         CASE WHEN s.activity_id IS NOT NULL THEN s.activity_completed_at ELSE NULL END AS desired_completed_at,
         CASE WHEN s.activity_id IS NOT NULL THEN s.activity_id ELSE NULL END AS desired_activity_id,
         CASE
           WHEN s.activity_id IS NOT NULL AND s.activity_completed_at>s.due_at THEN s.activity_completed_at
           WHEN s.activity_id IS NOT NULL THEN NULL
           WHEN s.terminal_sequence IS NOT NULL AND s.sequence>s.terminal_sequence THEN NULL
           WHEN @now>s.due_at THEN COALESCE(s.breached_at,@now)
           ELSE NULL
         END AS desired_breached_at
  FROM source s
)
UPDATE si
SET status=d.desired_status,
    completed_at=d.desired_completed_at,
    completion_activity_id=d.desired_activity_id,
    breached_at=d.desired_breached_at,
    context_json=JSON_MODIFY(
      JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.backfillHistoryReplayedBy','migration_171'),
      '$.pastRungsSkipped',CAST(0 AS BIT)
    ),
    updated_at=@now
OUTPUT INSERTED.id,INSERTED.lead_id,d.sequence,
       DELETED.status,INSERTED.status,DELETED.completed_at,INSERTED.completed_at,
       INSERTED.completion_activity_id
INTO @changed(id,lead_id,sequence,old_status,new_status,old_completed_at,new_completed_at,new_activity_id)
FROM dbo.lead_sla_instances si
JOIN desired d ON d.id=si.id
WHERE ISNULL(si.status,'')<>d.desired_status
   OR ISNULL(si.completed_at,'19000101')<>ISNULL(d.desired_completed_at,'19000101')
   OR ISNULL(si.completion_activity_id,-1)<>ISNULL(d.desired_activity_id,-1)
   OR ISNULL(si.breached_at,'19000101')<>ISNULL(d.desired_breached_at,'19000101')
   OR ISNULL(JSON_VALUE(si.context_json,'$.backfillHistoryReplayedBy'),'')<>'migration_171'
   OR ISNULL(JSON_VALUE(si.context_json,'$.pastRungsSkipped'),'true')<>'false';

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'completed',
       CONCAT('sla-completed:',c.id,':migration-171:',c.new_activity_id),
       c.old_status,'completed',c.new_completed_at,
       CONCAT(N'{"source":"migration_171_contact_retry_history","sequence":',c.sequence,
              N',"activityId":',c.new_activity_id,N'}')
FROM @changed c
WHERE c.new_status='completed' AND c.new_activity_id IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-completed:',c.id,':migration-171:',c.new_activity_id)
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'breached',
       CONCAT('sla-state:',c.id,':breached:migration-171'),
       c.old_status,'breached',@now,
       CONCAT(N'{"source":"migration_171_contact_retry_history","sequence":',c.sequence,N'}')
FROM @changed c
WHERE c.new_status='breached' AND c.old_status<>'breached'
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-state:',c.id,':breached:migration-171')
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'cancelled',
       CONCAT('sla-cancelled:',c.id,':terminal-contact:migration-171'),
       c.old_status,'cancelled',@now,
       CONCAT(N'{"source":"migration_171_contact_retry_history","sequence":',c.sequence,N'}')
FROM @changed c
WHERE c.new_status='cancelled' AND c.old_status<>'cancelled'
  AND NOT EXISTS(
    SELECT 1 FROM dbo.lead_sla_events e
    WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':terminal-contact:migration-171')
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
