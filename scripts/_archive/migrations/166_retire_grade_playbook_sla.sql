-- 166: Retire the GRADE_PLAYBOOK SLA ("โทรติดตามลูกค้า" every 24 hours) and the
-- GRADE_A_NEXT_ACTION policy it grew out of.
--
-- The business rule is "a lead we have already reached needs no chasing". The
-- follow-up model that survives is the one that was there all along:
--   FIRST_CONTACT  — reach the lead
--   CONTACT_RETRY  — ติดตามลูกค้าครั้งที่ 1..4 (Day 3/5/7/30), only for the ones
--                    we could not reach, cancelled the moment we do
-- The playbook clock sat outside both. It opened when the grade was set, and a
-- grade is only ever set after the lead has been reached, so every instance was
-- born into the state the new rule says needs no clock at all. The data agreed:
-- of 218 open instances, 218 were breached, none had ever completed, none had
-- ever reached a second cycle, and 210 carried a started_at equal to the very
-- contact that should have ended them.
--
-- leads.customer_grade and lead_grade_history stay untouched — grade still sets
-- priority and talk track, it just no longer owns a deadline.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Withdraw the policies -----------------------------------------------

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code IN ('GRADE_PLAYBOOK','GRADE_A_NEXT_ACTION') AND is_active=1;

DECLARE @cancelled TABLE (id INT, lead_id INT, old_status NVARCHAR(20));

UPDATE si
SET status='cancelled',
    -- The contact timestamps are facts and stay; the breach verdict is the
    -- policy's opinion and is withdrawn together with the policy.
    breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.retiredBy','grade_playbook_retired'),
    updated_at=GETDATE()
OUTPUT INSERTED.id, INSERTED.lead_id, DELETED.status INTO @cancelled
FROM dbo.lead_sla_instances si
WHERE si.policy_code IN ('GRADE_PLAYBOOK','GRADE_A_NEXT_ACTION') AND si.status<>'cancelled';

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT c.id,c.lead_id,'cancelled',CONCAT('sla-cancelled:',c.id,':policy-retired'),c.old_status,'cancelled',GETDATE(),
       N'{"reason":"policy_retired","policyCode":"GRADE_PLAYBOOK","migration":166}'
FROM @cancelled c
WHERE NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':policy-retired'));

-- 2. Close the retry-ladder gap the playbook was masking -------------------
--
-- Leads that were called and never reached kept only the playbook as a live
-- clock, because migration 149 skipped FIRST_CONTACT for every lead that
-- already had a contact activity when the SLA engine arrived, and
-- createRetrySchedule only ever runs off an open FIRST_CONTACT. Removing the
-- playbook would leave them with nothing at all, so the ladder they should
-- have had is registered here, anchored — exactly as the code does it — on the
-- first attempt that failed.
--
-- Only rungs that have not yet come due are created. The policy was not
-- watching these leads back then, and awarding it retroactive breaches would
-- invent verdicts for a period nobody was measuring; the same reason section 1
-- clears breached_at rather than keeping it.

;WITH failed AS (
  SELECT l.id lead_id, l.assigned_user_id,
         a.id activity_id, a.created_at failed_at,
         ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY a.created_at, a.id) rn
  FROM dbo.leads l
  JOIN dbo.lead_activities a
    ON a.lead_id = l.id
   AND a.activity_type IN ('call','visit','line','other','follow_up')
   AND (a.contact_result = 'unreachable' OR (a.contact_result IS NULL AND a.title LIKE N'ติดต่อไม่ได้%'))
  WHERE l.status IN ('pre_survey','pre_survey-01','pre_survey-02')
    -- never reached: no connected attempt and no appointment, which is itself
    -- durable proof that a conversation happened (resolveFirstContactEvidence)
    AND NOT EXISTS (SELECT 1 FROM dbo.lead_activities c
                    WHERE c.lead_id = l.id
                      AND c.activity_type IN ('call','visit','line','other','follow_up')
                      AND (c.contact_result = 'connected'
                        OR (c.contact_result IS NULL AND c.title NOT LIKE N'ติดต่อไม่ได้%'
                            AND c.title NOT LIKE N'%ข้อมูลติดต่อไม่ถูกต้อง%')))
    AND NOT EXISTS (SELECT 1 FROM dbo.lead_activities ap
                    WHERE ap.lead_id = l.id AND ap.activity_type LIKE 'appointment%')
    -- and nothing is already watching them
    AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_instances si
                    WHERE si.lead_id = l.id
                      AND si.policy_code IN ('FIRST_CONTACT','CONTACT_RETRY')
                      AND si.status IN ('active','warning','critical','breached'))
), anchor AS (
  SELECT lead_id, assigned_user_id, activity_id, failed_at FROM failed WHERE rn = 1
), rung AS (
  SELECT 1 sequence, 3 offset_days UNION ALL
  SELECT 2, 5 UNION ALL
  SELECT 3, 7 UNION ALL
  SELECT 4, 30
), ladder AS (
  SELECT a.lead_id, a.assigned_user_id, a.activity_id, a.failed_at, r.sequence, r.offset_days,
         DATEADD(DAY, r.offset_days, a.failed_at) due_at,
         DATEADD(DAY, r.offset_days - 1, a.failed_at) warning_at,
         CONCAT('contact-retry:',a.lead_id,':d',r.offset_days,':',a.activity_id) instance_key
  FROM anchor a CROSS JOIN rung r
)
INSERT dbo.lead_sla_instances(
  lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id, owner_role,
  started_at, target_at, due_at, warning_at, status, context_json
)
SELECT l.lead_id, 'CONTACT_RETRY', 1, l.instance_key,
       CONCAT(N'ติดตามลูกค้าครั้งที่ ', l.sequence, N' (Day ', l.offset_days, N')'),
       l.assigned_user_id, 'sales',
       l.failed_at, l.due_at, l.due_at, l.warning_at,
       CASE WHEN DATEDIFF(MINUTE, GETDATE(), l.due_at) <= 30 THEN 'critical'
            WHEN GETDATE() >= l.warning_at THEN 'warning' ELSE 'active' END,
       CONCAT('{"sequence":',l.sequence,',"offsetDays":',l.offset_days,
              ',"anchorActivityId":',l.activity_id,
              ',"backfilledBy":"migration_166","pastRungsSkipped":true}')
FROM ladder l
WHERE l.due_at > GETDATE()
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_instances si WHERE si.instance_key = l.instance_key);

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,to_status,event_at,detail_json)
SELECT si.id, si.lead_id, 'created', CONCAT('sla-created:',si.instance_key), si.status, si.started_at,
       N'{"source":"migration_166_retry_ladder_backfill"}'
FROM dbo.lead_sla_instances si
WHERE si.policy_code='CONTACT_RETRY'
  AND JSON_VALUE(si.context_json,'$.backfilledBy')='migration_166'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-created:',si.instance_key));
