-- 165: Retire the AFTER_SALES SLA ("ติดตามหลังติดตั้งและสอบถามความพึงพอใจ").
-- The stage keeps one rule: close the case within seven days of the finished
-- installation, which CLOSE_LEAD already measures. AFTER_SALES sat on the same
-- anchor with a shorter deadline and completed on the first connected contact
-- after handover, so it mostly reported the same follow-up call twice — once as
-- its own verdict and once inside the closing clock.
-- Every historical instance is cancelled, so the row leaves the Timeline, the
-- ผ่าน/เกิน counters and the SLA dashboard together.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='AFTER_SALES' AND is_active=1;

DECLARE @cancelled TABLE (id INT, lead_id INT, old_status NVARCHAR(20));

UPDATE si
SET status='cancelled',
    -- The follow-up timestamp is a fact and stays; the breach verdict is the
    -- policy's opinion and is withdrawn with the policy.
    breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.retiredBy','after_sales_retired'),
    updated_at=GETDATE()
OUTPUT INSERTED.id, INSERTED.lead_id, DELETED.status INTO @cancelled
FROM dbo.lead_sla_instances si
WHERE si.policy_code='AFTER_SALES' AND si.status<>'cancelled';

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT c.id,c.lead_id,'cancelled',CONCAT('sla-cancelled:',c.id,':policy-retired'),c.old_status,'cancelled',GETDATE(),
       N'{"reason":"policy_retired","policyCode":"AFTER_SALES","migration":165}'
FROM @cancelled c
WHERE NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':policy-retired'));
