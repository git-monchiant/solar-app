-- 150: Complete operational Sales SLA policy catalogue.
-- Forward-only and idempotent. Actual instances are reconciled by sla-service
-- from durable lead workflow milestones.

IF COL_LENGTH('dbo.leads', 'owner_assigned_at') IS NULL
BEGIN
  ALTER TABLE dbo.leads ADD owner_assigned_at DATETIME2 NULL;
  EXEC(N'UPDATE dbo.leads SET owner_assigned_at = created_at WHERE assigned_user_id IS NOT NULL AND owner_assigned_at IS NULL');
END;

GO

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'ASSIGN_OWNER' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('ASSIGN_OWNER', 1, N'ลงทะเบียนและมอบหมายผู้รับผิดชอบ Lead', 'response', 15, 30, 'ELAPSED_MINUTES', N'{"targetMinutes":15,"hardLimitMinutes":60,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'ELECTRICITY_ASSESSMENT' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('ELECTRICITY_ASSESSMENT', 1, N'ประเมินการใช้ไฟฟ้าและให้คำปรึกษา', 'stage', 1440, 240, 'ELAPSED_MINUTES', N'{"anchor":"first_successful_contact","hours":24,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'BOOK_SURVEY' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('BOOK_SURVEY', 1, N'นัดหมายสำรวจ', 'stage', 1440, 240, 'ELAPSED_MINUTES', N'{"anchor":"assessment_completed","hours":24,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'SITE_SURVEY' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('SITE_SURVEY', 1, N'สำรวจหน้างาน', 'stage', 4320, 1440, 'CALENDAR_DAYS', N'{"anchor":"survey_booked","days":3,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'PROPOSAL_ROI' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('PROPOSAL_ROI', 1, N'Proposal และ ROI/Financial Solution', 'stage', 2880, 720, 'ELAPSED_MINUTES', N'{"anchor":"survey_completed","hours":48,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'DEPOSIT_CLOSE' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('DEPOSIT_CLOSE', 1, N'มัดจำและปิดการขาย', 'stage', 10080, 2880, 'CALENDAR_DAYS', N'{"anchor":"proposal_sent","days":7,"continuousFollowUp":true,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'SCHEDULE_INSTALLATION' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('SCHEDULE_INSTALLATION', 1, N'นัดหมายติดตั้ง', 'stage', 4320, 1440, 'CALENDAR_DAYS', N'{"anchor":"deposit_confirmed","days":3,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'INSTALLATION' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('INSTALLATION', 1, N'ติดตั้งและส่งมอบงาน', 'stage', 10080, 2880, 'TARGET_AND_HARD_LIMIT', N'{"anchor":"deposit_confirmed","targetDays":7,"hardLimitDays":14,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'AFTER_SALES' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('AFTER_SALES', 1, N'ติดตามหลังการขาย', 'stage', 4320, 1440, 'CALENDAR_DAYS', N'{"anchor":"installation_completed","days":3,"continuousFollowUp":true,"calendarDays":true}');

-- Backfill measurable milestones for active leads. Runtime reconciliation uses
-- the same durable signals and will reopen/cancel an instance if a milestone is
-- later rolled back by an administrator.
;WITH milestones AS (
  SELECT l.id lead_id, l.status lead_status, l.assigned_user_id, l.created_at, l.owner_assigned_at,
         contact.created_at contacted_at,
         COALESCE(assessment.created_at, l.pre_booked_at, booked.created_at, survey_done.created_at) assessment_at,
         COALESCE(booked.created_at, l.pre_booked_at, survey_done.created_at) booked_at,
         survey_done.created_at survey_done_at,
         proposal.created_at proposal_at,
         deposit.confirmed_at deposit_at,
         install_booked.created_at install_booked_at,
         l.install_completed_at,
         COALESCE(after_sales.created_at, l.warranty_issued_at) after_sales_at,
         assessment.id assessment_activity_id, booked.id booked_activity_id,
         survey_done.id survey_activity_id, proposal.id proposal_activity_id,
         install_booked.id install_booked_activity_id, after_sales.id after_sales_activity_id
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type IN ('call','visit','line','other','follow_up')
      AND (a.contact_result = 'connected'
        OR (a.contact_result IS NULL AND a.title NOT LIKE N'ติดต่อไม่ได้%' AND a.title NOT LIKE N'%ข้อมูลติดต่อไม่ถูกต้อง%'))
    ORDER BY a.created_at, a.id
  ) contact
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND (a.title LIKE N'%เสนอขาย%' OR a.activity_type = 'sales_assessment')
    ORDER BY a.created_at, a.id
  ) assessment
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND (a.activity_type = 'presurvey_doc_created'
      OR (a.activity_type = 'appointment_set' AND a.title LIKE N'%สำรวจ%'))
    ORDER BY a.created_at, a.id
  ) booked
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'status_change' AND a.new_status = 'quote'
    ORDER BY a.created_at, a.id
  ) survey_done
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND ((a.activity_type = 'status_change' AND a.new_status = 'order')
      OR (a.activity_type = 'quotation' AND a.title LIKE N'%ส่งใบเสนอราคา%'))
    ORDER BY a.created_at, a.id
  ) proposal
  OUTER APPLY (
    SELECT TOP 1 p.id, p.confirmed_at FROM dbo.payments p
    WHERE p.lead_id = l.id AND p.slip_field LIKE 'order[_]%' AND p.confirmed_at IS NOT NULL
    ORDER BY p.confirmed_at, p.id
  ) deposit
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND ((a.activity_type = 'appointment_set' AND a.title LIKE N'%ติดตั้ง%')
      OR (a.activity_type = 'status_change' AND a.new_status = 'install'))
    ORDER BY a.created_at, a.id
  ) install_booked
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND l.install_completed_at IS NOT NULL
      AND a.created_at >= l.install_completed_at
      AND a.activity_type IN ('call','visit','line','other','follow_up')
      AND (a.contact_result = 'connected' OR a.contact_result IS NULL)
    ORDER BY a.created_at, a.id
  ) after_sales
  WHERE l.status NOT IN ('lost','returned')
), stages AS (
  SELECT lead_id, assigned_user_id, 'ASSIGN_OWNER' policy_code,
         N'ตรวจสอบข้อมูลและมอบหมายผู้รับผิดชอบ' task_name,
         created_at anchor_at, owner_assigned_at completion_at,
         CAST(NULL AS INT) completion_activity_id, 15 target_minutes, 60 due_minutes, 30 warning_minutes
  FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'ELECTRICITY_ASSESSMENT', N'ประเมินการใช้ไฟฟ้าและให้คำปรึกษาเบื้องต้น',
         contacted_at, assessment_at, COALESCE(assessment_activity_id, booked_activity_id), 1440, 1440, 240 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'BOOK_SURVEY', N'ยืนยันวัน เวลา และนัดหมายสำรวจ',
         assessment_at, booked_at, booked_activity_id, 1440, 1440, 240 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'SITE_SURVEY', N'เข้าตรวจสำรวจหน้างาน',
         booked_at, survey_done_at, survey_activity_id, 4320, 4320, 1440 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'PROPOSAL_ROI', N'จัดส่ง Proposal พร้อม ROI และทางเลือกการเงิน',
         survey_done_at, proposal_at, proposal_activity_id, 2880, 2880, 720 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'DEPOSIT_CLOSE', N'ติดตามมัดจำและปิดการขาย',
         proposal_at, deposit_at, NULL, 10080, 10080, 2880 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'SCHEDULE_INSTALLATION', N'นัดวันติดตั้งและแจ้งเตรียมเอกสาร',
         deposit_at, install_booked_at, install_booked_activity_id, 4320, 4320, 1440 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'INSTALLATION', N'ติดตั้ง ทดสอบระบบ และส่งมอบงาน',
         deposit_at, install_completed_at, NULL, 10080, 20160, 2880 FROM milestones
  UNION ALL SELECT lead_id, assigned_user_id, 'AFTER_SALES', N'ติดตามหลังติดตั้งและสอบถามความพึงพอใจ',
         install_completed_at, after_sales_at, after_sales_activity_id, 4320, 4320, 1440 FROM milestones
)
INSERT dbo.lead_sla_instances(
  lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id,
  started_at, target_at, due_at, warning_at, status, completed_at,
  completion_activity_id, breached_at, context_json
)
SELECT s.lead_id, s.policy_code, 1,
       CONCAT('operational:', LOWER(s.policy_code), ':', s.lead_id), s.task_name, s.assigned_user_id,
       s.anchor_at, DATEADD(MINUTE, s.target_minutes, s.anchor_at), DATEADD(MINUTE, s.due_minutes, s.anchor_at),
       DATEADD(MINUTE, -s.warning_minutes, DATEADD(MINUTE, s.due_minutes, s.anchor_at)),
       CASE WHEN s.completion_at IS NOT NULL THEN 'completed'
            WHEN GETDATE() > DATEADD(MINUTE, s.due_minutes, s.anchor_at) THEN 'breached'
            WHEN DATEDIFF(MINUTE, GETDATE(), DATEADD(MINUTE, s.due_minutes, s.anchor_at)) <= 30 THEN 'critical'
            WHEN GETDATE() >= DATEADD(MINUTE, -s.warning_minutes, DATEADD(MINUTE, s.due_minutes, s.anchor_at)) THEN 'warning'
            ELSE 'active' END,
       s.completion_at, s.completion_activity_id,
       CASE WHEN GETDATE() > DATEADD(MINUTE, s.due_minutes, s.anchor_at)
              THEN COALESCE(s.completion_at, GETDATE()) END,
       N'{"operational":true,"calendarDays":true,"timezone":"Asia/Bangkok","backfilled":true}'
FROM stages s
WHERE s.anchor_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_instances si
    WHERE si.instance_key = CONCAT('operational:', LOWER(s.policy_code), ':', s.lead_id)
  );

UPDATE si
SET owner_user_id = COALESCE(l.assigned_user_id, si.owner_user_id),
    status = CASE WHEN l.owner_assigned_at IS NOT NULL THEN 'completed'
                  WHEN GETDATE() > si.due_at THEN 'breached'
                  WHEN DATEDIFF(MINUTE, GETDATE(), si.due_at) <= 30 THEN 'critical'
                  WHEN si.warning_at IS NOT NULL AND GETDATE() >= si.warning_at THEN 'warning'
                  ELSE 'active' END,
    completed_at = l.owner_assigned_at,
    breached_at = CASE WHEN l.owner_assigned_at > si.due_at THEN COALESCE(si.breached_at, l.owner_assigned_at)
                       WHEN l.owner_assigned_at IS NULL AND GETDATE() > si.due_at THEN COALESCE(si.breached_at, GETDATE())
                       ELSE NULL END,
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id = si.lead_id
WHERE si.policy_code = 'ASSIGN_OWNER' AND si.instance_key LIKE 'operational:%';

-- Historical rows can lack old activity logs even though the lead has already
-- moved beyond that stage. Do not show those missing upstream milestones as a
-- current breach; cancel only the unmeasurable task while retaining its audit.
UPDATE si
SET status = 'cancelled', completed_at = NULL, updated_at = GETDATE(),
    context_json = JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.cancelReason', 'stage_already_passed')
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id = si.lead_id
WHERE si.instance_key LIKE 'operational:%'
  AND si.status IN ('active','warning','critical','breached')
  AND (
    (si.policy_code IN ('ELECTRICITY_ASSESSMENT','BOOK_SURVEY') AND l.status IN ('survey','quote','order','install','warranty','gridtie','closed'))
    OR (si.policy_code = 'SITE_SURVEY' AND l.status IN ('quote','order','install','warranty','gridtie','closed'))
    OR (si.policy_code = 'PROPOSAL_ROI' AND l.status IN ('order','install','warranty','gridtie','closed'))
    OR (si.policy_code = 'DEPOSIT_CLOSE' AND l.status IN ('install','warranty','gridtie','closed'))
    OR (si.policy_code IN ('SCHEDULE_INSTALLATION','INSTALLATION') AND l.status IN ('warranty','gridtie','closed'))
  );

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, to_status, event_at, detail_json)
SELECT si.id, si.lead_id, 'created', CONCAT('sla-created:', si.instance_key), si.status, si.started_at,
       N'{"source":"migration_150_backfill"}'
FROM dbo.lead_sla_instances si
WHERE si.instance_key LIKE 'operational:%'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key = CONCAT('sla-created:', si.instance_key));

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, from_status, to_status, event_at, detail_json)
SELECT si.id, si.lead_id, 'completed', CONCAT('sla-completed:', si.id, ':milestone'), 'active', 'completed', si.completed_at,
       N'{"source":"migration_150_backfill"}'
FROM dbo.lead_sla_instances si
WHERE si.instance_key LIKE 'operational:%' AND si.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key = CONCAT('sla-completed:', si.id, ':milestone'));
