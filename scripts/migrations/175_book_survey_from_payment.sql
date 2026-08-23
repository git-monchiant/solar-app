-- 175: BOOK_SURVEY starts from confirmed Pre-Survey payment.
-- Normal payment is confirmed by Account; zero-baht/free payment is confirmed
-- when Sales advances from the payment step. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='BOOK_SURVEY' AND version=5)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'BOOK_SURVEY',5,N'ยืนยันวัน เวลา และนัดหมาย Pre-Survey','stage',1440,240,'ELAPSED_MINUTES',
    N'{"hours":24,"anchor":"payment_confirmed","freeAnchor":"sales_advance_payment_step","appointmentIsFallbackEvidence":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=5 THEN 1 ELSE 0 END, updated_at=GETDATE()
WHERE policy_code='BOOK_SURVEY'
  AND is_active<>CASE WHEN version=5 THEN 1 ELSE 0 END;

-- Use the earliest confirmed Pre-Survey payment where available. Historical
-- free rows have no payments record, so retain their durable Survey Ready /
-- booking timestamp and label it as a migrated zero-baht confirmation.
;WITH paid AS (
  SELECT l.id,
         COALESCE(p.confirmed_at,l.survey_ready_at,l.pre_booked_at,l.updated_at) anchor_at,
         p.confirmed_by
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 p.confirmed_at,p.confirmed_by
    FROM dbo.payments p
    WHERE p.lead_id=l.id AND p.slip_field='pre_slip_url' AND p.confirmed_at IS NOT NULL
    ORDER BY p.confirmed_at,p.id
  ) p
  WHERE l.payment_confirmed=1
)
UPDATE l
SET survey_ready_at=paid.anchor_at,
    survey_ready_note=CASE
      WHEN paid.confirmed_by IS NOT NULL THEN N'ข้อมูลเดิม · Account ยืนยันการชำระค่าจอง'
      WHEN l.pre_survey_fee_type='free' THEN N'ข้อมูลเดิม · ฟรีค่าจอง'
      ELSE COALESCE(l.survey_ready_note,N'ข้อมูลเดิม · ยืนยันการชำระค่าจอง')
    END,
    updated_at=GETDATE()
FROM dbo.leads l
JOIN paid ON paid.id=l.id
WHERE paid.anchor_at IS NOT NULL
  AND (l.survey_ready_at IS NULL OR l.survey_ready_at<>paid.anchor_at);

DECLARE @cancelled TABLE(id BIGINT,lead_id INT,old_status NVARCHAR(20));

UPDATE si
SET status='cancelled',breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.cancelReason','payment_confirmation_required'),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.status INTO @cancelled
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='BOOK_SURVEY'
  AND si.status IN ('active','warning','critical','breached')
  AND ISNULL(l.payment_confirmed,0)=0;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'cancelled',CONCAT('sla-cancelled:',c.id,':payment-required'),
       c.old_status,'cancelled',GETDATE(),N'{"reason":"payment_confirmation_required","migration":175}'
FROM @cancelled c
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':payment-required')
);

-- Re-anchor only open paid work. Completed history remains immutable.
UPDATE si
SET policy_version=5,
    started_at=l.survey_ready_at,
    target_at=DATEADD(DAY,1,l.survey_ready_at),
    due_at=DATEADD(DAY,1,l.survey_ready_at),
    warning_at=DATEADD(HOUR,20,l.survey_ready_at),
    status=CASE WHEN GETDATE()>DATEADD(DAY,1,l.survey_ready_at) THEN 'breached'
                WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(DAY,1,l.survey_ready_at))<=30 THEN 'critical'
                WHEN GETDATE()>=DATEADD(HOUR,20,l.survey_ready_at) THEN 'warning'
                ELSE 'active' END,
    breached_at=CASE WHEN GETDATE()>DATEADD(DAY,1,l.survey_ready_at)
                     THEN COALESCE(si.breached_at,GETDATE()) ELSE NULL END,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource','payment_confirmed'),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='BOOK_SURVEY'
  AND si.status IN ('active','warning','critical','breached')
  AND l.payment_confirmed=1
  AND l.survey_ready_at IS NOT NULL;
