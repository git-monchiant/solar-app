-- 145: Give active Admin accounts their own copy of supervisor approval
-- notifications so role preview can retain an independent read state.

;WITH notification_events AS (
  SELECT
    quotation_id,
    lead_id,
    notification_type,
    approval_stage,
    title,
    message,
    created_by,
    read_at,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY quotation_id, notification_type, approval_stage, title, created_at
      ORDER BY id
    ) AS event_row
  FROM dbo.quotation_approval_notifications
  WHERE approval_stage IN ('solar_sup', 'sales_sup')
)
INSERT dbo.quotation_approval_notifications(
  quotation_id,
  lead_id,
  recipient_user_id,
  notification_type,
  approval_stage,
  title,
  message,
  created_by,
  read_at,
  created_at
)
SELECT
  event.quotation_id,
  event.lead_id,
  admin_user.id,
  event.notification_type,
  event.approval_stage,
  event.title,
  event.message,
  event.created_by,
  event.read_at,
  event.created_at
FROM notification_events event
CROSS JOIN dbo.users admin_user
WHERE event.event_row = 1
  AND admin_user.is_active = 1
  AND ISJSON(admin_user.roles) = 1
  AND EXISTS (
    SELECT 1 FROM OPENJSON(admin_user.roles) roles WHERE roles.[value] = 'admin'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.quotation_approval_notifications existing
    WHERE existing.recipient_user_id = admin_user.id
      AND existing.quotation_id = event.quotation_id
      AND existing.notification_type = event.notification_type
      AND ISNULL(existing.approval_stage, '') = ISNULL(event.approval_stage, '')
      AND existing.title = event.title
      AND existing.created_at = event.created_at
  );
