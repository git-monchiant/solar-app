-- 152: Payment installment 1 and loan preliminary-approval SLA.
-- Forward-only and idempotent. Production is not touched by this script itself.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'PAYMENT_INSTALLMENT_1' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('PAYMENT_INSTALLMENT_1', 1, N'ติดตามชำระเงินงวดที่ 1 เพื่อยืนยันราคา', 'stage', 10080, 2880, 'CALENDAR_DAYS',
          N'{"anchor":"quotation_received_by_customer","days":7,"methods":["transfer","cheque","cc"],"installment":1,"calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'LOAN_PREAPPROVAL' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('LOAN_PREAPPROVAL', 1, N'ติดตามผลอนุมัติเบื้องต้นจากธนาคาร', 'stage', 21600, 4320, 'CALENDAR_DAYS',
          N'{"anchor":"survey_completed_and_loan_documents_complete","days":15,"completion":"bank_preliminary_result","calendarDays":true}');

-- NOTE (corrected while writing migration 159): the retirement of DEPOSIT_CLOSE
-- that used to live here has been removed. PAYMENT_INSTALLMENT_1 and
-- LOAN_PREAPPROVAL track how the customer pays; they do not replace
-- "ปิดการขายและรับมัดจำ". Migration 156 re-registered DEPOSIT_CLOSE and
-- sla-service never stopped reconciling it, so these statements only served to
-- supersede live instances again on every dev re-run. Migration 159 reinstates
-- the rows they already superseded.

;WITH milestones AS (
  SELECT l.id lead_id, l.assigned_user_id,
         JSON_VALUE(CASE WHEN ISJSON(l.order_installments) = 1 THEN l.order_installments ELSE N'[]' END, '$[0].method') first_method,
         CASE WHEN EXISTS (
           SELECT 1 FROM OPENJSON(CASE WHEN ISJSON(l.order_installments) = 1 THEN l.order_installments ELSE N'[]' END)
           WITH (method NVARCHAR(20) '$.method') j WHERE j.method = 'loan'
         ) THEN 1 ELSE 0 END has_loan,
         quotation_received.id quotation_activity_id, quotation_received.created_at quotation_received_at,
         installment_1.confirmed_at installment_1_paid_at,
         survey_done.created_at survey_done_at,
         loan_docs.created_at loan_docs_at,
         loan_result.id loan_result_activity_id, loan_result.created_at loan_result_at
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'quotation'
      AND a.title LIKE N'%ส่งใบเสนอราคาให้ลูกค้า%'
    ORDER BY a.created_at, a.id
  ) quotation_received
  OUTER APPLY (
    SELECT TOP 1 p.confirmed_at FROM dbo.payments p
    WHERE p.lead_id = l.id AND p.slip_field IN ('order_installment_0', 'order_before_slip')
      AND p.confirmed_at IS NOT NULL
    ORDER BY p.confirmed_at, p.id
  ) installment_1
  OUTER APPLY (
    SELECT TOP 1 a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'status_change' AND a.new_status = 'quote'
    ORDER BY a.created_at, a.id
  ) survey_done
  OUTER APPLY (
    SELECT TOP 1 a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'loan_followup'
      AND a.contact_outcome_code = 'loan_documents_complete'
    ORDER BY a.created_at, a.id
  ) loan_docs
  OUTER APPLY (
    SELECT TOP 1 a.id, a.created_at FROM dbo.lead_activities a
    WHERE a.lead_id = l.id AND a.activity_type = 'loan_followup'
      AND a.contact_outcome_code IN ('loan_preapproved', 'loan_preapproval_rejected')
    ORDER BY a.created_at, a.id
  ) loan_result
  WHERE l.status NOT IN ('lost', 'returned')
), stages AS (
  SELECT lead_id, assigned_user_id, 'PAYMENT_INSTALLMENT_1' policy_code,
         N'ติดตามชำระเงินงวดที่ 1 เพื่อยืนยันราคา' task_name,
         quotation_received_at anchor_at, installment_1_paid_at completion_at,
         CAST(NULL AS INT) completion_activity_id,
         10080 target_minutes, 10080 due_minutes, 2880 warning_minutes
  FROM milestones WHERE first_method IN ('transfer', 'cheque', 'cc')
  UNION ALL
  SELECT lead_id, assigned_user_id, 'LOAN_PREAPPROVAL',
         N'ติดตามผลอนุมัติเบื้องต้นจากธนาคาร',
         CASE WHEN survey_done_at >= loan_docs_at THEN survey_done_at ELSE loan_docs_at END,
         loan_result_at, loan_result_activity_id,
         21600, 21600, 4320
  FROM milestones WHERE has_loan = 1 AND survey_done_at IS NOT NULL AND loan_docs_at IS NOT NULL
)
INSERT dbo.lead_sla_instances(
  lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id, owner_role,
  started_at, target_at, due_at, warning_at, status, completed_at,
  completion_activity_id, breached_at, context_json
)
SELECT s.lead_id, s.policy_code, 1,
       CONCAT('operational:', LOWER(s.policy_code), ':', s.lead_id), s.task_name,
       s.assigned_user_id, 'sales', s.anchor_at,
       DATEADD(MINUTE, s.target_minutes, s.anchor_at),
       DATEADD(MINUTE, s.due_minutes, s.anchor_at),
       DATEADD(MINUTE, -s.warning_minutes, DATEADD(MINUTE, s.due_minutes, s.anchor_at)),
       CASE WHEN s.completion_at IS NOT NULL THEN 'completed'
            WHEN GETDATE() > DATEADD(MINUTE, s.due_minutes, s.anchor_at) THEN 'breached'
            WHEN DATEDIFF(MINUTE, GETDATE(), DATEADD(MINUTE, s.due_minutes, s.anchor_at)) <= 30 THEN 'critical'
            WHEN GETDATE() >= DATEADD(MINUTE, -s.warning_minutes, DATEADD(MINUTE, s.due_minutes, s.anchor_at)) THEN 'warning'
            ELSE 'active' END,
       s.completion_at, s.completion_activity_id,
       CASE WHEN GETDATE() > DATEADD(MINUTE, s.due_minutes, s.anchor_at)
              THEN COALESCE(s.completion_at, GETDATE()) END,
       N'{"operational":true,"calendarDays":true,"timezone":"Asia/Bangkok","backfilled":true,"migration":152}'
FROM stages s
WHERE s.anchor_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_instances si
    WHERE si.instance_key = CONCAT('operational:', LOWER(s.policy_code), ':', s.lead_id)
  );

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, to_status, event_at, detail_json)
SELECT si.id, si.lead_id, 'created', CONCAT('sla-created:', si.instance_key), si.status, si.started_at,
       N'{"source":"migration_152_backfill"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code IN ('PAYMENT_INSTALLMENT_1', 'LOAN_PREAPPROVAL')
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key = CONCAT('sla-created:', si.instance_key));

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, from_status, to_status, event_at, detail_json)
SELECT si.id, si.lead_id, 'completed', CONCAT('sla-completed:', si.id, ':milestone'), 'active', 'completed', si.completed_at,
       N'{"source":"migration_152_backfill"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code IN ('PAYMENT_INSTALLMENT_1', 'LOAN_PREAPPROVAL') AND si.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key = CONCAT('sla-completed:', si.id, ':milestone'));
