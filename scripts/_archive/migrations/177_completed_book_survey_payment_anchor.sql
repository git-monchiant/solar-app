-- 177: Re-anchor completed BOOK_SURVEY history to confirmed Pre-Survey payment.
-- Migration 175 intentionally preserved completed rows; this correction makes
-- their Timeline order consistent with policy v5. If a legacy appointment was
-- recorded before Account confirmed payment, clamp the anchor to completion so
-- elapsed time never becomes negative. Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_started_at DATETIME2 NOT NULL,
  new_started_at DATETIME2 NOT NULL,
  anchor_source NVARCHAR(50) NOT NULL
);

;WITH desired AS (
  SELECT si.id,
         CASE WHEN si.completed_at<l.survey_ready_at
              THEN si.completed_at ELSE l.survey_ready_at END started_at,
         CASE WHEN si.completed_at<l.survey_ready_at
              THEN N'appointment_before_payment' ELSE N'payment_confirmed' END anchor_source
  FROM dbo.lead_sla_instances si
  JOIN dbo.leads l ON l.id=si.lead_id
  WHERE si.policy_code='BOOK_SURVEY'
    AND si.status='completed'
    AND si.completed_at IS NOT NULL
    AND ISNULL(l.payment_confirmed,0)=1
    AND l.survey_ready_at IS NOT NULL
)
UPDATE si
SET policy_version=5,
    started_at=d.started_at,
    target_at=DATEADD(DAY,1,d.started_at),
    due_at=DATEADD(DAY,1,d.started_at),
    warning_at=DATEADD(HOUR,20,d.started_at),
    breached_at=CASE WHEN si.completed_at>DATEADD(DAY,1,d.started_at)
                     THEN si.completed_at ELSE NULL END,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource',d.anchor_source),
    updated_at=GETDATE()
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.started_at,INSERTED.started_at,d.anchor_source
INTO @changed(id,lead_id,old_started_at,new_started_at,anchor_source)
FROM dbo.lead_sla_instances si
JOIN desired d ON d.id=si.id
WHERE si.policy_version<>5
   OR si.started_at<>d.started_at
   OR ISNULL(JSON_VALUE(si.context_json,'$.anchorSource'),'')<>d.anchor_source;

UPDATE si
SET context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.anchorSource',c.anchor_source),
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
JOIN @changed c ON c.id=si.id;

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'anchor_changed',
       CONCAT('sla-anchor-payment-correction:',c.id,':',CONVERT(BIGINT,DATEDIFF_BIG(MILLISECOND,'19700101',c.new_started_at))),
       'completed','completed',GETDATE(),
       CONCAT(N'{"rule":"completed_book_survey_payment_anchor","anchorSource":"',c.anchor_source,
              N'","from":"',CONVERT(VARCHAR(33),c.old_started_at,126),
              N'","to":"',CONVERT(VARCHAR(33),c.new_started_at,126),N'"}')
FROM @changed c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-anchor-payment-correction:',c.id,':',CONVERT(BIGINT,DATEDIFF_BIG(MILLISECOND,'19700101',c.new_started_at)))
);
