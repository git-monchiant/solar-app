-- 174: Separate Sales Grade from customer consent to arrange Pre-Survey.
-- BOOK_SURVEY starts only at Survey Ready; an existing appointment/booking is
-- durable legacy evidence. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.leads','survey_ready_at') IS NULL
  ALTER TABLE dbo.leads ADD survey_ready_at DATETIME2 NULL;
IF COL_LENGTH('dbo.leads','survey_ready_by') IS NULL
  ALTER TABLE dbo.leads ADD survey_ready_by INT NULL;
IF COL_LENGTH('dbo.leads','survey_ready_note') IS NULL
  ALTER TABLE dbo.leads ADD survey_ready_note NVARCHAR(500) NULL;

GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE parent_object_id=OBJECT_ID('dbo.leads') AND name='FK_leads_survey_ready_by'
)
  ALTER TABLE dbo.leads ADD CONSTRAINT FK_leads_survey_ready_by
    FOREIGN KEY (survey_ready_by) REFERENCES dbo.users(id);

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='BOOK_SURVEY' AND version=4)
  INSERT dbo.sla_policies(
    policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json
  ) VALUES(
    'BOOK_SURVEY',4,N'ยืนยันวัน เวลา และนัดหมาย Pre-Survey','stage',1440,240,'ELAPSED_MINUTES',
    N'{"hours":24,"anchor":"survey_ready","appointmentIsFallbackEvidence":true,"appliesToAllGrades":true}'
  );

UPDATE dbo.sla_policies
SET is_active=CASE WHEN version=4 THEN 1 ELSE 0 END, updated_at=GETDATE()
WHERE policy_code='BOOK_SURVEY'
  AND is_active<>CASE WHEN version=4 THEN 1 ELSE 0 END;

-- Backfill only from durable commitment evidence. The earliest qualifying fact
-- becomes Survey Ready; no Grade timestamp is used.
;WITH evidence AS (
  SELECT l.id,e.ready_at,e.ready_by,e.source
  FROM dbo.leads l
  OUTER APPLY (
    SELECT TOP 1 x.ready_at,x.ready_by,x.source
    FROM (
      SELECT a.created_at ready_at,a.created_by ready_by,N'appointment_activity' source,1 priority
      FROM dbo.lead_activities a
      WHERE a.lead_id=l.id AND a.activity_type='appointment_set' AND a.title LIKE N'%สำรวจ%'
      UNION ALL
      SELECT l.pre_booked_at,NULL,N'booking_record',2 WHERE l.pre_booked_at IS NOT NULL
      UNION ALL
      SELECT a.created_at,a.created_by,N'advanced_stage',3
      FROM dbo.lead_activities a
      WHERE a.lead_id=l.id AND a.activity_type='status_change'
        AND a.new_status IN ('survey','quote','order','install','warranty','gridtie','closed')
    ) x
    WHERE x.ready_at IS NOT NULL
    ORDER BY x.ready_at,x.priority
  ) e
  WHERE l.survey_ready_at IS NULL AND e.ready_at IS NOT NULL
)
UPDATE l
SET survey_ready_at=e.ready_at,
    survey_ready_by=e.ready_by,
    survey_ready_note=CONCAT(N'ข้อมูลเดิม · ',e.source),
    updated_at=GETDATE()
FROM dbo.leads l JOIN evidence e ON e.id=l.id;

DECLARE @cancelled TABLE(id BIGINT,lead_id INT,old_status NVARCHAR(20));

UPDATE si
SET status='cancelled',breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.cancelReason','survey_ready_required'),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.status INTO @cancelled
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='BOOK_SURVEY'
  AND si.status IN ('active','warning','critical','breached')
  AND l.survey_ready_at IS NULL;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'cancelled',CONCAT('sla-cancelled:',c.id,':survey-ready-required'),
       c.old_status,'cancelled',GETDATE(),N'{"reason":"survey_ready_required","migration":174}'
FROM @cancelled c
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':survey-ready-required')
);

-- Re-anchor the remaining open work to the customer's commitment. Completed
-- rows remain immutable audit history and will be preserved by runtime too.
UPDATE si
SET policy_version=4,
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
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource','survey_ready'),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id=si.lead_id
WHERE si.policy_code='BOOK_SURVEY'
  AND si.status IN ('active','warning','critical','breached')
  AND l.survey_ready_at IS NOT NULL;
