-- 159: Every grade follows the policy set that used to belong to Grade A.
--   * BOOK_SURVEY / SITE_SURVEY / PROPOSAL_ROI / DEPOSIT_CLOSE / CLOSE_LEAD
--     apply to every graded lead instead of Grade A only.
--   * GRADE_PLAYBOOK collapses to one repeating task for all grades:
--     "โทรติดตามลูกค้า" due 24 hours after the last connected contact.
-- Grade still drives priority and messaging, not the SLA clock.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Policy catalogue -------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='BOOK_SURVEY' AND version=3)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('BOOK_SURVEY',3,N'นัดหมาย Pre-Survey','stage',1440,240,'ELAPSED_MINUTES',N'{"hours":24,"anchor":"grade_assigned","appliesToAllGrades":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='SITE_SURVEY' AND version=3)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('SITE_SURVEY',3,N'สำรวจหน้างาน','stage',10080,2880,'SCHEDULED_APPOINTMENT',N'{"days":7,"anchor":"scheduled_appointment","appliesToAllGrades":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='PROPOSAL_ROI' AND version=3)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('PROPOSAL_ROI',3,N'ส่ง Proposal หลัง Survey','stage',1440,240,'ELAPSED_MINUTES',N'{"hours":24,"anchor":"survey_completed","appliesToAllGrades":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='DEPOSIT_CLOSE' AND version=3)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('DEPOSIT_CLOSE',3,N'ปิดการขายและรับมัดจำ','stage',4320,1440,'CALENDAR_DAYS',N'{"days":3,"anchor":"proposal_sent","appliesToAllGrades":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='CLOSE_LEAD' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('CLOSE_LEAD',2,N'ปิด Lead หลังส่งมอบงาน','stage',10080,2880,'CALENDAR_DAYS',N'{"days":7,"anchor":"installation_completed","appliesToAllGrades":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='GRADE_PLAYBOOK' AND version=2)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('GRADE_PLAYBOOK',2,N'โทรติดตามลูกค้าทุก 24 ชั่วโมง','grade_playbook',1440,240,'ELAPSED_MINUTES',
    N'{"steps":["daily_follow_up"],"hours":24,"anchor":"last_connected_contact","oneOpenTaskAtATime":true,"advanceOnConnectedActivity":true,"appliesToAllGrades":true}');

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE is_active=1 AND (
     (policy_code IN ('BOOK_SURVEY','SITE_SURVEY','PROPOSAL_ROI','DEPOSIT_CLOSE') AND version IN (1,2))
  OR (policy_code='CLOSE_LEAD' AND version=1)
  OR (policy_code='GRADE_PLAYBOOK' AND version=1));

-- 2. Reinstate the stages migration 156 retired for non-Grade-A leads -------
-- Anchors are unchanged; only the applicability rule was wrong. A lead that
-- never booked its survey therefore returns as genuinely overdue.

;WITH period AS (
  SELECT si.id, si.started_at, si.completed_at,
         CASE si.policy_code WHEN 'BOOK_SURVEY' THEN 1440 WHEN 'SITE_SURVEY' THEN 10080
                             WHEN 'PROPOSAL_ROI' THEN 1440 ELSE 4320 END due_minutes,
         CASE si.policy_code WHEN 'BOOK_SURVEY' THEN 240 WHEN 'SITE_SURVEY' THEN 2880
                             WHEN 'PROPOSAL_ROI' THEN 240 ELSE 1440 END warning_minutes
  FROM dbo.lead_sla_instances si
  WHERE si.status='superseded'
    AND JSON_VALUE(si.context_json,'$.supersedeReason')='not_grade_a'
)
UPDATE si
SET policy_version=3, superseded_at=NULL,
    target_at=DATEADD(MINUTE,p.due_minutes,p.started_at),
    due_at=DATEADD(MINUTE,p.due_minutes,p.started_at),
    warning_at=DATEADD(MINUTE,-p.warning_minutes,DATEADD(MINUTE,p.due_minutes,p.started_at)),
    status=CASE
      WHEN p.completed_at IS NOT NULL THEN 'completed'
      WHEN GETDATE()>DATEADD(MINUTE,p.due_minutes,p.started_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,p.due_minutes,p.started_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,-p.warning_minutes,DATEADD(MINUTE,p.due_minutes,p.started_at)) THEN 'warning'
      ELSE 'active' END,
    breached_at=CASE
      WHEN p.completed_at IS NOT NULL
        THEN CASE WHEN p.completed_at>DATEADD(MINUTE,p.due_minutes,p.started_at) THEN p.completed_at ELSE NULL END
      WHEN GETDATE()>DATEADD(MINUTE,p.due_minutes,p.started_at) THEN GETDATE()
      ELSE NULL END,
    context_json=JSON_MODIFY(JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.supersedeReason',NULL),'$.reinstatedBy','all_grades_v1'),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN period p ON p.id=si.id;

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'reopened',CONCAT('sla-reinstated:',si.id,':all-grades-v1'),'superseded',si.status,GETDATE(),
       N'{"reason":"all_grades_same_policy","rule":"all_grades_v1"}'
FROM dbo.lead_sla_instances si
WHERE JSON_VALUE(si.context_json,'$.reinstatedBy')='all_grades_v1'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-reinstated:',si.id,':all-grades-v1'));

-- Leads that never had these instances at all (non-Grade-A leads created after
-- migration 156) are reconciled by sla-service the next time the lead is read.

-- 2b. Reinstate the DEPOSIT_CLOSE instances migration 152 retired ------------
-- 152 treated PAYMENT_INSTALLMENT_1 + LOAN_PREAPPROVAL as a replacement for the
-- deposit stage. They are not: they track the payment method. The offending
-- statements are removed from 152, and any instance it already superseded on a
-- database that ran the old version is restored here.

;WITH from_152 AS (
  SELECT DISTINCT si.id, si.started_at
  FROM dbo.lead_sla_instances si
  JOIN dbo.lead_sla_events e ON e.sla_instance_id = si.id
  WHERE si.policy_code = 'DEPOSIT_CLOSE'
    AND si.status = 'superseded'
    AND si.completed_at IS NULL
    AND e.event_key = CONCAT('sla-superseded:', si.id, ':migration-152')
)
UPDATE si
SET policy_version=3, superseded_at=NULL,
    target_at=DATEADD(MINUTE,4320,f.started_at),
    due_at=DATEADD(MINUTE,4320,f.started_at),
    warning_at=DATEADD(MINUTE,2880,f.started_at),
    status=CASE
      WHEN GETDATE()>DATEADD(MINUTE,4320,f.started_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,4320,f.started_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,2880,f.started_at) THEN 'warning'
      ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(MINUTE,4320,f.started_at) THEN COALESCE(si.breached_at,GETDATE()) END,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.reinstatedBy','deposit_close_v1'),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si JOIN from_152 f ON f.id=si.id;

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'reopened',CONCAT('sla-reinstated:',si.id,':deposit-close-v1'),'superseded',si.status,GETDATE(),
       N'{"reason":"deposit_close_not_replaced_by_payment_policies","rule":"deposit_close_v1"}'
FROM dbo.lead_sla_instances si
WHERE JSON_VALUE(si.context_json,'$.reinstatedBy')='deposit_close_v1'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-reinstated:',si.id,':deposit-close-v1'));

-- 3. Collapse the Grade A-F playbooks into one repeating task ---------------

-- Only the retired per-grade sequences (version 1) are superseded. Touching
-- version 2 here would wipe the unified task on every re-run, because the
-- insert below is keyed on instance_key and would then find it already taken.
UPDATE si
SET status='superseded', superseded_at=GETDATE(), updated_at=GETDATE(),
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.supersedeReason','unified_playbook_v2')
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_PLAYBOOK'
  AND si.policy_version < 2
  AND si.status IN ('active','warning','critical','breached');

-- Repair databases that ran the first draft of this file, where the statement
-- above had no version guard and left the unified task superseded.
UPDATE si
SET status=CASE
      WHEN GETDATE()>DATEADD(MINUTE,1440,si.started_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,1440,si.started_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,1200,si.started_at) THEN 'warning'
      ELSE 'active' END,
    superseded_at=NULL,
    breached_at=CASE WHEN GETDATE()>DATEADD(MINUTE,1440,si.started_at) THEN COALESCE(si.breached_at,GETDATE()) END,
    context_json=JSON_MODIFY(si.context_json,'$.supersedeReason',NULL),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_PLAYBOOK'
  AND si.policy_version=2
  AND si.status='superseded'
  AND si.completed_at IS NULL
  AND JSON_VALUE(si.context_json,'$.supersedeReason')='unified_playbook_v2';

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'superseded',CONCAT('sla-superseded:',si.id,':unified-playbook-v2'),NULL,'superseded',GETDATE(),
       N'{"reason":"unified_playbook_v2"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_PLAYBOOK' AND JSON_VALUE(si.context_json,'$.supersedeReason')='unified_playbook_v2'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-superseded:',si.id,':unified-playbook-v2'));

-- One open task per eligible lead, anchored at the last conversation that
-- actually connected so an active lead is not made overdue by an old grade
-- date. Eligibility mirrors sla-service exactly: graded, not lost/returned,
-- and no confirmed order payment yet.
;WITH eligible AS (
  SELECT l.id lead_id, l.customer_grade, l.assigned_user_id, gh.id grade_history_id,
         COALESCE(contact.created_at, gh.changed_at) anchor_at
  FROM dbo.leads l
  CROSS APPLY (SELECT TOP 1 id,changed_at FROM dbo.lead_grade_history
               WHERE lead_id=l.id AND new_grade=l.customer_grade ORDER BY changed_at DESC,id DESC) gh
  OUTER APPLY (SELECT TOP 1 a.created_at FROM dbo.lead_activities a
               WHERE a.lead_id=l.id AND a.activity_type IN ('call','visit','line','other','follow_up')
                 AND (a.contact_result='connected'
                   OR (a.contact_result IS NULL AND a.title NOT LIKE N'ติดต่อไม่ได้%' AND a.title NOT LIKE N'%ข้อมูลติดต่อไม่ถูกต้อง%'))
               ORDER BY a.created_at DESC,a.id DESC) contact
  WHERE l.customer_grade IN ('A','B','C','D','E','F')
    AND l.status NOT IN ('lost','returned')
    AND NOT EXISTS (SELECT 1 FROM dbo.payments p
                    WHERE p.lead_id=l.id AND p.slip_field LIKE 'order[_]%' AND p.confirmed_at IS NOT NULL)
)
INSERT dbo.lead_sla_instances(
  lead_id,policy_code,policy_version,instance_key,task_name,owner_user_id,owner_role,
  started_at,target_at,due_at,warning_at,status,breached_at,context_json
)
SELECT e.lead_id,'GRADE_PLAYBOOK',2,
  CONCAT('grade-playbook:v2:',e.lead_id,':',e.customer_grade,':',e.grade_history_id,':0:0'),
  N'โทรติดตามลูกค้า',e.assigned_user_id,'sales',e.anchor_at,
  DATEADD(MINUTE,1440,e.anchor_at),DATEADD(MINUTE,1440,e.anchor_at),DATEADD(MINUTE,1200,e.anchor_at),
  CASE WHEN GETDATE()>DATEADD(MINUTE,1440,e.anchor_at) THEN 'breached'
       WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,1440,e.anchor_at))<=30 THEN 'critical'
       WHEN GETDATE()>=DATEADD(MINUTE,1200,e.anchor_at) THEN 'warning' ELSE 'active' END,
  CASE WHEN GETDATE()>DATEADD(MINUTE,1440,e.anchor_at) THEN GETDATE() END,
  CONCAT('{"grade":"',e.customer_grade,'","gradeHistoryId":',e.grade_history_id,
         ',"stepIndex":0,"stepCode":"daily_follow_up","cycle":0,"ruleVersion":2,"calendarDays":true,"timezone":"Asia/Bangkok"}')
FROM eligible e
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.lead_sla_instances si
  WHERE si.instance_key=CONCAT('grade-playbook:v2:',e.lead_id,':',e.customer_grade,':',e.grade_history_id,':0:0'));

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,to_status,event_at,detail_json)
SELECT si.id,si.lead_id,'created',CONCAT('sla-created:',si.instance_key),si.status,si.started_at,
       N'{"source":"migration_159_unified_playbook"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code='GRADE_PLAYBOOK' AND si.policy_version=2
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-created:',si.instance_key));

-- 4. Normalise the version stamp on the instances that are still open --------
-- Migration 156 recalculates open Grade A rows and stamps its own version, so
-- after a full-folder re-run the stamp can lag behind the active policy. The
-- deadline it writes is identical to the one registered above, so only the
-- stamp has to be brought into agreement. sla-service writes the same values
-- the next time each lead is reconciled.

UPDATE dbo.lead_sla_instances
SET policy_version=3, updated_at=GETDATE()
WHERE policy_code IN ('BOOK_SURVEY','SITE_SURVEY','PROPOSAL_ROI','DEPOSIT_CLOSE')
  AND status IN ('active','warning','critical','breached')
  AND policy_version<3;

UPDATE dbo.lead_sla_instances
SET policy_version=2, updated_at=GETDATE()
WHERE policy_code='CLOSE_LEAD'
  AND status IN ('active','warning','critical','breached')
  AND policy_version<2;
