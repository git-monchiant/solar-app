-- 180: Retire CONTACT_RETRY v1 rows recreated after the sequential v2 migration.
--
-- Migration 171 used fixed-anchor instance keys. Migration 172 converted the
-- ladder to sequential actual-start keys, so replaying 171 afterward could
-- recreate the old v1 rows. Preserve those rows and events for audit, but mark
-- them superseded and restore next_follow_up from the valid v2 chain.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @now DATETIME2 = GETDATE();
DECLARE @changed TABLE(
  id BIGINT PRIMARY KEY,
  lead_id INT NOT NULL,
  old_status NVARCHAR(30) NULL
);

UPDATE legacy
SET status='superseded',
    superseded_at=COALESCE(legacy.superseded_at,@now),
    context_json=JSON_MODIFY(
      JSON_MODIFY(COALESCE(legacy.context_json,'{}'),'$.supersededBy','migration_180'),
      '$.supersededReason','sequential_v2_exists'
    ),
    updated_at=@now
OUTPUT INSERTED.id,INSERTED.lead_id,DELETED.status
INTO @changed(id,lead_id,old_status)
FROM dbo.lead_sla_instances legacy
WHERE legacy.policy_code='CONTACT_RETRY'
  AND legacy.policy_version=1
  AND JSON_VALUE(legacy.context_json,'$.backfilledBy')='migration_166'
  AND (legacy.status<>'superseded' OR legacy.superseded_at IS NULL)
  AND EXISTS(
    SELECT 1
    FROM dbo.lead_sla_instances v2
    WHERE v2.lead_id=legacy.lead_id
      AND v2.policy_code='CONTACT_RETRY'
      AND v2.policy_version>=2
      AND JSON_VALUE(v2.context_json,'$.sequentialActualStart')='true'
  );

INSERT dbo.lead_sla_events(
  sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json
)
SELECT c.id,c.lead_id,'superseded',
       CONCAT('sla-superseded:',c.id,':contact-retry-v2-guard'),
       c.old_status,'superseded',@now,
       N'{"source":"migration_180","reason":"sequential_v2_exists"}'
FROM @changed c
WHERE NOT EXISTS(
  SELECT 1
  FROM dbo.lead_sla_events e
  WHERE e.event_key=CONCAT('sla-superseded:',c.id,':contact-retry-v2-guard')
);

;WITH affected AS (
  SELECT DISTINCT lead_id FROM @changed
), next_open AS (
  SELECT a.lead_id,MIN(si.due_at) AS next_due_at
  FROM affected a
  LEFT JOIN dbo.lead_sla_instances si
    ON si.lead_id=a.lead_id
   AND si.policy_code='CONTACT_RETRY'
   AND si.policy_version>=2
   AND si.superseded_at IS NULL
   AND si.status IN ('active','warning','critical','breached')
  GROUP BY a.lead_id
)
UPDATE l
SET next_follow_up=CAST(n.next_due_at AS DATE),updated_at=@now
FROM dbo.leads l
JOIN next_open n ON n.lead_id=l.id
WHERE ISNULL(l.next_follow_up,'19000101')<>ISNULL(CAST(n.next_due_at AS DATE),'19000101');

IF EXISTS(
  SELECT 1
  FROM dbo.lead_sla_instances legacy
  WHERE legacy.policy_code='CONTACT_RETRY'
    AND legacy.policy_version=1
    AND legacy.status IN ('active','warning','critical','breached')
    AND EXISTS(
      SELECT 1 FROM dbo.lead_sla_instances v2
      WHERE v2.lead_id=legacy.lead_id
        AND v2.policy_code='CONTACT_RETRY'
        AND v2.policy_version>=2
        AND JSON_VALUE(v2.context_json,'$.sequentialActualStart')='true'
    )
)
  THROW 51000,'Migration 180 left an open legacy CONTACT_RETRY row',1;

IF EXISTS(
  SELECT lead_id
  FROM dbo.lead_sla_instances
  WHERE policy_code='CONTACT_RETRY'
    AND policy_version>=2
    AND superseded_at IS NULL
    AND status IN ('active','warning','critical','breached')
  GROUP BY lead_id
  HAVING COUNT(*)>1
)
  THROW 51000,'Migration 180 found multiple open sequential CONTACT_RETRY rows',1;

COMMIT TRANSACTION;

SELECT COUNT(*) AS superseded_legacy_rows,
       COUNT(DISTINCT lead_id) AS affected_leads
FROM @changed;
