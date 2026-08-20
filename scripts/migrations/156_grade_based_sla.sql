-- 156: Two-phase SLA: source-based Lead Management, then Grade A-F playbook.
-- Existing graded leads begin at migration time so legacy data is not made
-- overdue retroactively. Completed SLA history is retained.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='FIRST_CONTACT' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('FIRST_CONTACT',2,N'ติดต่อ Lead ครั้งแรกตาม Source','response',NULL,NULL,'SOURCE_AND_BUSINESS_HOURS',N'{"officeHours":"09:00-19:00","callLine":{"officeMinutes":15,"outsideMinutes":30},"digital":{"officeMinutes":15,"outsideMinutes":1440},"eventMinutes":1440,"timezone":"Asia/Bangkok"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='ELECTRICITY_ASSESSMENT' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('ELECTRICITY_ASSESSMENT',2,N'ประเมินและกำหนด Grade Lead','qualification',NULL,NULL,'SOURCE_QUALIFICATION',N'{"callMinutes":30,"digitalMinutes":60,"referralMinutes":120,"eventMinutes":120,"timezone":"Asia/Bangkok"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='BOOK_SURVEY' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('BOOK_SURVEY',2,N'Grade A: นัดหมาย Pre-Survey','grade_stage',1440,240,'ELAPSED_MINUTES',N'{"grade":"A","hours":24}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SITE_SURVEY' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('SITE_SURVEY',2,N'Grade A: สำรวจหน้างาน','grade_stage',10080,2880,'SCHEDULED_APPOINTMENT',N'{"grade":"A","days":7}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='PROPOSAL_ROI' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('PROPOSAL_ROI',2,N'Grade A: ส่ง Proposal หลัง Survey','grade_stage',1440,240,'ELAPSED_MINUTES',N'{"grade":"A","hours":24,"anchor":"survey_completed"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='DEPOSIT_CLOSE' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('DEPOSIT_CLOSE',2,N'Grade A: ปิดการขายและรับมัดจำ','grade_stage',4320,1440,'CALENDAR_DAYS',N'{"grade":"A","days":3,"anchor":"proposal_sent"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SCHEDULE_INSTALLATION' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('SCHEDULE_INSTALLATION',2,N'นัดหมายติดตั้ง','stage',10080,2880,'CALENDAR_DAYS',N'{"days":7,"anchor":"deposit_confirmed"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='INSTALLATION' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('INSTALLATION',2,N'ติดตั้ง ทดสอบ และส่งมอบ','stage',21600,4320,'CALENDAR_DAYS',N'{"days":15,"anchor":"deposit_confirmed"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='GRADE_PLAYBOOK' AND version=1)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('GRADE_PLAYBOOK',1,N'กิจกรรมติดตามตาม Grade A-F','grade_playbook',NULL,NULL,'GRADE_SEQUENCE',N'{"grades":["A","B","C","D","E","F"],"oneOpenTaskAtATime":true,"advanceOnConnectedActivity":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='CLOSE_LEAD' AND version=1)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('CLOSE_LEAD',1,N'ปิด Lead หลังส่งมอบงาน','stage',10080,2880,'CALENDAR_DAYS',N'{"grade":"A","days":7,"anchor":"installation_completed"}');

-- Establish a safe epoch for legacy grades. This is explicitly synthetic and
-- prevents a current playbook from inheriting an unknown historical date.
INSERT dbo.lead_grade_history(lead_id,old_grade,new_grade,reason,changed_by,changed_at)
SELECT l.id,NULL,l.customer_grade,N'grade_sla_backfill_v1',NULL,GETDATE()
FROM dbo.leads l
WHERE l.customer_grade IN ('A','B','C','D','E','F')
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_grade_history gh WHERE gh.lead_id=l.id);

-- Retire the old Grade-A-only generic task and any previous playbook epoch.
UPDATE si
SET status='superseded', superseded_at=GETDATE(), updated_at=GETDATE(),
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.supersedeReason','grade_playbook_v1')
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_A_NEXT_ACTION'
  AND si.status IN ('active','warning','critical','breached');

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'superseded',CONCAT('sla-superseded:',si.id,':grade-playbook-v1'),
       NULL,'superseded',GETDATE(),N'{"reason":"grade_playbook_v1"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_A_NEXT_ACTION' AND si.status='superseded'
  AND JSON_VALUE(si.context_json,'$.supersedeReason')='grade_playbook_v1'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-superseded:',si.id,':grade-playbook-v1'));

-- Pre-survey closing work belongs only to Grade A. Keep completed history but
-- remove invalid open breaches from all other/ungraded leads.
UPDATE si
SET status='superseded', superseded_at=GETDATE(), breached_at=NULL, updated_at=GETDATE(),
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.supersedeReason','not_grade_a')
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code IN ('BOOK_SURVEY','SITE_SURVEY','PROPOSAL_ROI','DEPOSIT_CLOSE')
  AND si.status IN ('active','warning','critical','breached')
  AND (l.customer_grade IS NULL OR l.customer_grade<>'A');

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'superseded',CONCAT('sla-superseded:',si.id,':not-grade-a-v1'),
       NULL,'superseded',GETDATE(),N'{"reason":"not_grade_a","rule":"grade_based_sla_v1"}'
FROM dbo.lead_sla_instances si
WHERE si.status='superseded' AND JSON_VALUE(si.context_json,'$.supersedeReason')='not_grade_a'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-superseded:',si.id,':not-grade-a-v1'));

-- A stored Grade is durable evidence that qualification finished. Legacy
-- grades have no historical timestamp, so complete at their safe backfill
-- epoch instead of retaining a false qualification breach.
;WITH qualified AS (
  SELECT l.id lead_id,l.source,gh.changed_at grade_at,
    CASE WHEN LOWER(COALESCE(l.source,'')) LIKE '%call%' OR LOWER(COALESCE(l.source,''))='walk_in' THEN 30
         WHEN LOWER(COALESCE(l.source,'')) LIKE '%referral%' OR LOWER(COALESCE(l.source,'')) LIKE '%event%' OR LOWER(COALESCE(l.source,'')) LIKE '%booth%' THEN 120
         ELSE 60 END due_minutes
  FROM dbo.leads l
  CROSS APPLY (SELECT TOP 1 changed_at FROM dbo.lead_grade_history WHERE lead_id=l.id AND new_grade=l.customer_grade ORDER BY changed_at DESC,id DESC) gh
  WHERE l.customer_grade IN ('A','B','C','D','E','F')
)
UPDATE si
SET policy_version=2,task_name=N'ประเมินและกำหนด Grade Lead',started_at=q.grade_at,
    target_at=DATEADD(MINUTE,q.due_minutes,q.grade_at),due_at=DATEADD(MINUTE,q.due_minutes,q.grade_at),
    warning_at=DATEADD(MINUTE,-CASE WHEN q.due_minutes=30 THEN 10 WHEN q.due_minutes=60 THEN 15 ELSE 30 END,DATEADD(MINUTE,q.due_minutes,q.grade_at)),
    status='completed',completed_at=q.grade_at,breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.qualificationRuleVersion',1),updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN qualified q ON q.lead_id=si.lead_id
WHERE si.policy_code='ELECTRICITY_ASSESSMENT' AND si.status IN ('active','warning','critical','breached');

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'completed',CONCAT('sla-completed:',si.id,':grade-qualification-v1'),NULL,'completed',si.completed_at,
       N'{"source":"grade_assignment","rule":"grade_qualification_v1"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code='ELECTRICITY_ASSESSMENT' AND JSON_VALUE(si.context_json,'$.qualificationRuleVersion')='1'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-completed:',si.id,':grade-qualification-v1'));

-- Reset an open Grade A Pre-Survey SLA to the known grade epoch. Historical
-- completed appointments are deliberately not rewritten.
;WITH grade_epoch AS (
  SELECT l.id lead_id,gh.id grade_history_id,gh.changed_at grade_at
  FROM dbo.leads l
  CROSS APPLY (SELECT TOP 1 id,changed_at FROM dbo.lead_grade_history WHERE lead_id=l.id AND new_grade='A' ORDER BY changed_at DESC,id DESC) gh
  WHERE l.customer_grade='A'
)
UPDATE si
SET policy_version=2, task_name=N'ยืนยันวัน เวลา และนัดหมาย Pre-Survey',
    started_at=g.grade_at,target_at=DATEADD(DAY,1,g.grade_at),due_at=DATEADD(DAY,1,g.grade_at),
    warning_at=DATEADD(HOUR,20,g.grade_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,1,g.grade_at) THEN 'breached'
                WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(DAY,1,g.grade_at))<=30 THEN 'critical'
                WHEN GETDATE()>=DATEADD(HOUR,20,g.grade_at) THEN 'warning' ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,1,g.grade_at) THEN COALESCE(si.breached_at,GETDATE()) ELSE NULL END,
    context_json=JSON_MODIFY(JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.grade','A'),'$.gradeRuleVersion',1),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN grade_epoch g ON g.lead_id=si.lead_id
WHERE si.policy_code='BOOK_SURVEY' AND si.status IN ('active','warning','critical','breached') AND si.completed_at IS NULL;

-- Recalculate the remaining open Grade A closing stages with version 2 time.
UPDATE si
SET policy_version=2,target_at=DATEADD(DAY,7,started_at),due_at=DATEADD(DAY,7,started_at),
    warning_at=DATEADD(DAY,5,started_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,7,started_at) THEN 'breached'
                WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(DAY,7,started_at))<=30 THEN 'critical'
                WHEN GETDATE()>=DATEADD(DAY,5,started_at) THEN 'warning' ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,7,started_at) THEN COALESCE(breached_at,GETDATE()) ELSE NULL END,
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='SITE_SURVEY' AND l.customer_grade='A' AND si.status IN ('active','warning','critical','breached');

UPDATE si
SET policy_version=2,target_at=DATEADD(DAY,1,started_at),due_at=DATEADD(DAY,1,started_at),
    warning_at=DATEADD(HOUR,20,started_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,1,started_at) THEN 'breached'
                WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(DAY,1,started_at))<=30 THEN 'critical'
                WHEN GETDATE()>=DATEADD(HOUR,20,started_at) THEN 'warning' ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,1,started_at) THEN COALESCE(breached_at,GETDATE()) ELSE NULL END,
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='PROPOSAL_ROI' AND l.customer_grade='A' AND si.status IN ('active','warning','critical','breached');

UPDATE si
SET policy_version=2,target_at=DATEADD(DAY,3,started_at),due_at=DATEADD(DAY,3,started_at),
    warning_at=DATEADD(DAY,2,started_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,3,started_at) THEN 'breached'
                WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(DAY,3,started_at))<=30 THEN 'critical'
                WHEN GETDATE()>=DATEADD(DAY,2,started_at) THEN 'warning' ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,3,started_at) THEN COALESCE(breached_at,GETDATE()) ELSE NULL END,
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='DEPOSIT_CLOSE' AND l.customer_grade='A' AND si.status IN ('active','warning','critical','breached');

-- Align still-open event-driven installation work with the approved periods.
UPDATE dbo.lead_sla_instances
SET policy_version=2,target_at=DATEADD(DAY,7,started_at),due_at=DATEADD(DAY,7,started_at),
    warning_at=DATEADD(DAY,5,started_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,7,started_at) THEN 'breached'
                WHEN GETDATE()>=DATEADD(DAY,5,started_at) THEN 'warning' ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,7,started_at) THEN COALESCE(breached_at,GETDATE()) ELSE NULL END,
    updated_at=GETDATE()
WHERE policy_code='SCHEDULE_INSTALLATION' AND status IN ('active','warning','critical','breached');

UPDATE dbo.lead_sla_instances
SET policy_version=2,target_at=DATEADD(DAY,15,started_at),due_at=DATEADD(DAY,15,started_at),
    warning_at=DATEADD(DAY,12,started_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,15,started_at) THEN 'breached'
                WHEN GETDATE()>=DATEADD(DAY,12,started_at) THEN 'warning' ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,15,started_at) THEN COALESCE(breached_at,GETDATE()) ELSE NULL END,
    updated_at=GETDATE()
WHERE policy_code='INSTALLATION' AND status IN ('active','warning','critical','breached');

-- Recalculate the small number of still-open First Contact tasks by source.
;WITH first_contact_rule AS (
  SELECT si.id,
    CASE
      WHEN LOWER(COALESCE(l.source,'')) LIKE '%event%' OR LOWER(COALESCE(l.source,'')) LIKE '%booth%' THEN 1440
      WHEN CAST(si.started_at AS time)>='09:00' AND CAST(si.started_at AS time)<'19:00' THEN 15
      WHEN LOWER(COALESCE(l.source,'')) LIKE '%line%' OR LOWER(COALESCE(l.source,'')) LIKE '%call%' OR LOWER(COALESCE(l.source,''))='walk_in' THEN 30
      ELSE 1440 END due_minutes
  FROM dbo.lead_sla_instances si JOIN dbo.leads l ON l.id=si.lead_id
  WHERE si.policy_code='FIRST_CONTACT' AND si.status IN ('active','warning','critical','breached')
)
UPDATE si
SET policy_version=2,target_at=DATEADD(MINUTE,r.due_minutes,si.started_at),due_at=DATEADD(MINUTE,r.due_minutes,si.started_at),
    warning_at=DATEADD(MINUTE,-CASE WHEN r.due_minutes<=15 THEN 5 WHEN r.due_minutes<=30 THEN 10 ELSE 240 END,DATEADD(MINUTE,r.due_minutes,si.started_at)),
    status=CASE WHEN GETDATE()>DATEADD(MINUTE,r.due_minutes,si.started_at) THEN 'breached'
                WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,r.due_minutes,si.started_at))<=30 THEN 'critical'
                WHEN GETDATE()>=DATEADD(MINUTE,-CASE WHEN r.due_minutes<=15 THEN 5 WHEN r.due_minutes<=30 THEN 10 ELSE 240 END,DATEADD(MINUTE,r.due_minutes,si.started_at)) THEN 'warning'
                ELSE 'active' END,
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN first_contact_rule r ON r.id=si.id;

-- Existing graded leads receive exactly one current playbook task. The runtime
-- advances the sequence after a successful contact activity.
;WITH current_grade AS (
  SELECT l.id lead_id,l.customer_grade,l.assigned_user_id,gh.id grade_history_id,gh.changed_at grade_at,
    CASE l.customer_grade
      WHEN 'A' THEN N'โทรติดตามลูกค้า Grade A'
      WHEN 'B' THEN N'ส่ง Company Profile และ USP ผ่าน LINE'
      WHEN 'C' THEN N'ส่ง ROI วิเคราะห์ค่าไฟและความคุ้มค่า'
      WHEN 'D' THEN N'ส่ง FAQ แผงและข้อมูล Solar ผ่าน LINE OA'
      WHEN 'E' THEN N'ส่ง FAQ และข้อมูล Solar ผ่าน LINE OA'
      WHEN 'F' THEN N'เพิ่มเพื่อน LINE OA เพื่อสร้างการรับรู้' END task_name,
    CASE WHEN l.customer_grade='F' THEN 10080 ELSE 1440 END due_minutes,
    CASE WHEN l.customer_grade='F' THEN 2880 ELSE 240 END warning_minutes,
    CASE l.customer_grade WHEN 'A' THEN 'daily_follow_up' WHEN 'B' THEN 'send_company_profile'
      WHEN 'C' THEN 'send_roi' WHEN 'D' THEN 'send_faq' WHEN 'E' THEN 'send_faq' WHEN 'F' THEN 'add_line' END step_code
  FROM dbo.leads l
  CROSS APPLY (SELECT TOP 1 id,changed_at FROM dbo.lead_grade_history WHERE lead_id=l.id AND new_grade=l.customer_grade ORDER BY changed_at DESC,id DESC) gh
  WHERE l.customer_grade IN ('A','B','C','D','E','F') AND l.status NOT IN ('lost','returned','closed')
    AND NOT (l.customer_grade='A' AND (l.status IN ('order','install','warranty','gridtie') OR EXISTS(SELECT 1 FROM dbo.payments p WHERE p.lead_id=l.id AND p.slip_field LIKE 'order[_]%' AND p.confirmed_at IS NOT NULL)))
)
INSERT dbo.lead_sla_instances(
  lead_id,policy_code,policy_version,instance_key,task_name,owner_user_id,owner_role,
  started_at,target_at,due_at,warning_at,status,context_json
)
SELECT g.lead_id,'GRADE_PLAYBOOK',1,
  CONCAT('grade-playbook:',g.lead_id,':',g.customer_grade,':',g.grade_history_id,':0:0'),
  g.task_name,g.assigned_user_id,'sales',g.grade_at,
  DATEADD(MINUTE,g.due_minutes,g.grade_at),DATEADD(MINUTE,g.due_minutes,g.grade_at),
  DATEADD(MINUTE,-g.warning_minutes,DATEADD(MINUTE,g.due_minutes,g.grade_at)),'active',
  CONCAT('{"grade":"',g.customer_grade,'","gradeHistoryId":',g.grade_history_id,
         ',"stepIndex":0,"stepCode":"',g.step_code,'","cycle":0,"ruleVersion":1,"calendarDays":true,"timezone":"Asia/Bangkok"}')
FROM current_grade g
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.lead_sla_instances si
  WHERE si.instance_key=CONCAT('grade-playbook:',g.lead_id,':',g.customer_grade,':',g.grade_history_id,':0:0')
);

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'created',CONCAT('sla-created:',si.instance_key),si.status,si.started_at,
       N'{"source":"migration_156_grade_playbook"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_PLAYBOOK'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-created:',si.instance_key));

-- Guard historical rows whose legacy milestone order produced a completion
-- before the SLA anchor. Preserve the old values in an audit event, then clamp
-- elapsed time to zero rather than displaying a negative duration.
INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,event_at,detail_json)
SELECT si.id,si.lead_id,'data_inconsistency_guarded',CONCAT('sla-data-guarded:',si.id,':negative-elapsed-v1'),GETDATE(),
       CONCAT(N'{"reason":"completion_before_anchor","oldStartedAt":"',CONVERT(NVARCHAR(33),si.started_at,126),
              N'","completedAt":"',CONVERT(NVARCHAR(33),si.completed_at,126),N'"}')
FROM dbo.lead_sla_instances si
WHERE si.completed_at<si.started_at
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-data-guarded:',si.id,':negative-elapsed-v1'));

;WITH anomaly AS (
  SELECT id,completed_at,
         CASE WHEN DATEDIFF(MINUTE,started_at,target_at)<0 THEN 0 ELSE DATEDIFF(MINUTE,started_at,target_at) END target_minutes,
         CASE WHEN DATEDIFF(MINUTE,started_at,due_at)<0 THEN 0 ELSE DATEDIFF(MINUTE,started_at,due_at) END due_minutes,
         CASE WHEN DATEDIFF(MINUTE,warning_at,due_at)<0 THEN 0 ELSE DATEDIFF(MINUTE,warning_at,due_at) END warning_minutes
  FROM dbo.lead_sla_instances WHERE completed_at<started_at
)
UPDATE si
SET started_at=a.completed_at,target_at=DATEADD(MINUTE,a.target_minutes,a.completed_at),
    due_at=DATEADD(MINUTE,a.due_minutes,a.completed_at),
    warning_at=DATEADD(MINUTE,-a.warning_minutes,DATEADD(MINUTE,a.due_minutes,a.completed_at)),
    status='completed',breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.dataGuard','negative_elapsed_v1'),updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN anomaly a ON a.id=si.id;
