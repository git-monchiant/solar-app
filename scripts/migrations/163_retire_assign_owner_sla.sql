-- 163: Retire the ASSIGN_OWNER SLA ("ตรวจสอบข้อมูลและมอบหมายผู้รับผิดชอบ").
-- Assignment happens when the lead is created, so owner_assigned_at almost
-- always equals created_at and the row reported "ใช้จริง 0 นาที" — a clock that
-- measured nothing while still occupying a Timeline row and counting toward the
-- ผ่าน/เกิน chips and the SLA dashboard. Leads imported without an owner made it
-- worse: they showed a permanent breach nobody could act on.
-- leads.owner_assigned_at stays — assignment is still recorded, only the SLA on
-- it is withdrawn.
-- Every historical instance is cancelled, so the verdict disappears from the
-- dashboard, the lead SLA summary and the Timeline in one pass.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='ASSIGN_OWNER' AND is_active=1;

DECLARE @cancelled TABLE (id INT, lead_id INT, old_status NVARCHAR(20));

UPDATE si
SET status='cancelled',
    -- The assignment timestamp is a fact and stays; the breach verdict is the
    -- policy's opinion and is withdrawn with the policy.
    breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.retiredBy','assign_owner_retired'),
    updated_at=GETDATE()
OUTPUT INSERTED.id, INSERTED.lead_id, DELETED.status INTO @cancelled
FROM dbo.lead_sla_instances si
WHERE si.policy_code='ASSIGN_OWNER' AND si.status<>'cancelled';

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT c.id,c.lead_id,'cancelled',CONCAT('sla-cancelled:',c.id,':policy-retired'),c.old_status,'cancelled',GETDATE(),
       N'{"reason":"policy_retired","policyCode":"ASSIGN_OWNER","migration":163}'
FROM @cancelled c
WHERE NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':policy-retired'));
