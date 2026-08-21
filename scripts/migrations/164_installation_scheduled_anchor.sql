-- 164: INSTALLATION measures the crew's own window.
-- Until now the clock opened at deposit_confirmed and closed on
-- install_completed_at — the audit stamp of the "ติดตั้งเสร็จ" click. Both ends
-- were wrong for the thing being measured:
--   * A customer who books the visit weeks out burned the crew's clock while
--     nobody could act — 26 of 38 open instances read as breached this way.
--   * install_actual_date is the day the crew records as the real finish and is
--     the display source of truth; the click can land a day or more later. On
--     Development every one of the leads with both values had them differ.
-- Version 3 opens at the booked installation slot (install_date, falling back to
-- the old deposit anchor when no date was ever booked) and closes on the real
-- finish date, keeping the recorded time when the click lands the same day.
-- install_time_slot is empty on every lead today, so the booked instant is
-- midnight Bangkok — the same value sla-service computes for an empty slot.
-- A job recorded as finished before its own booked slot means the schedule was
-- edited after the fact; those fall back rather than report negative elapsed time.
-- Forward-only and idempotent: every value is recomputed from the lead row.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code='INSTALLATION' AND version=3)
  INSERT dbo.sla_policies(policy_code,version,name_th,policy_type,target_minutes,warning_minutes,deadline_rule,config_json)
  VALUES('INSTALLATION',3,N'ติดตั้งและส่งมอบงาน','stage',21600,4320,'SCHEDULED_APPOINTMENT',
    N'{"days":15,"anchor":"scheduled_installation","anchorFallback":"deposit_confirmed","completion":"install_actual_date","calendarDays":true}');

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='INSTALLATION' AND version IN (1,2) AND is_active=1;

;WITH src AS (
  SELECT si.id, si.started_at AS old_started_at, si.breached_at,
         CAST(CAST(l.install_date AS DATE) AS DATETIME2) AS booked_at,
         CASE
           WHEN l.install_actual_date IS NOT NULL AND l.install_completed_at IS NOT NULL
                AND CAST(l.install_actual_date AS DATE) = CAST(l.install_completed_at AS DATE)
             THEN l.install_completed_at
           WHEN l.install_actual_date IS NOT NULL
             THEN DATEADD(SECOND, 86399, CAST(CAST(l.install_actual_date AS DATE) AS DATETIME2))
           ELSE l.install_completed_at
         END AS new_completed_at
  FROM dbo.lead_sla_instances si
  JOIN dbo.leads l ON l.id = si.lead_id
  WHERE si.policy_code='INSTALLATION' AND si.status NOT IN ('cancelled','superseded')
), resolved AS (
  SELECT s.id, s.breached_at, s.new_completed_at,
         CASE
           WHEN s.booked_at IS NULL THEN s.old_started_at
           WHEN s.new_completed_at IS NOT NULL AND s.booked_at > s.new_completed_at
             THEN CASE WHEN s.old_started_at <= s.new_completed_at THEN s.old_started_at ELSE s.new_completed_at END
           ELSE s.booked_at
         END AS new_started_at
  FROM src s
)
UPDATE si
SET policy_version=3,
    started_at=r.new_started_at,
    target_at=DATEADD(MINUTE,21600,r.new_started_at),
    due_at=DATEADD(MINUTE,21600,r.new_started_at),
    warning_at=DATEADD(MINUTE,17280,r.new_started_at),
    completed_at=r.new_completed_at,
    status=CASE
      WHEN r.new_completed_at IS NOT NULL THEN 'completed'
      WHEN GETDATE()>DATEADD(MINUTE,21600,r.new_started_at) THEN 'breached'
      WHEN DATEDIFF(MINUTE,GETDATE(),DATEADD(MINUTE,21600,r.new_started_at))<=30 THEN 'critical'
      WHEN GETDATE()>=DATEADD(MINUTE,17280,r.new_started_at) THEN 'warning'
      ELSE 'active'
    END,
    breached_at=CASE
      WHEN r.new_completed_at IS NOT NULL
        THEN CASE WHEN r.new_completed_at>DATEADD(MINUTE,21600,r.new_started_at) THEN r.new_completed_at ELSE NULL END
      WHEN GETDATE()>DATEADD(MINUTE,21600,r.new_started_at) THEN COALESCE(si.breached_at,GETDATE())
      ELSE NULL
    END,
    updated_at=GETDATE()
FROM dbo.lead_sla_instances si
JOIN resolved r ON r.id=si.id;
