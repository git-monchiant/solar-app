-- 173: Remove the redundant Day N suffix from CONTACT_RETRY task labels.
-- The SLA duration remains available in the timing detail and context_json.
-- Forward-only and idempotent.

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.lead_sla_instances
SET task_name = CONCAT(
      N'ติดตามลูกค้าครั้งที่ ',
      TRY_CONVERT(INT, JSON_VALUE(context_json, '$.sequence'))
    ),
    updated_at = GETDATE()
WHERE policy_code = 'CONTACT_RETRY'
  AND TRY_CONVERT(INT, JSON_VALUE(context_json, '$.sequence')) BETWEEN 1 AND 4
  AND task_name <> CONCAT(
        N'ติดตามลูกค้าครั้งที่ ',
        TRY_CONVERT(INT, JSON_VALUE(context_json, '$.sequence'))
      );
