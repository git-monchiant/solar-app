-- 148: Add the Sale user who submitted payment evidence as a recipient of
-- existing payment-result notifications. The assigned Lead owner may be a
-- different Sale user. Per-user/event uniqueness prevents duplicate rows.

INSERT dbo.accounting_notifications(
  payment_id, lead_id, slip_field, recipient_user_id, notification_type,
  event_key, title, message, target_url, created_by,
  read_at, resolved_at, created_at, updated_at
)
SELECT
  source_notice.payment_id,
  source_notice.lead_id,
  source_notice.slip_field,
  submitter.id,
  source_notice.notification_type,
  source_notice.event_key,
  source_notice.title,
  source_notice.message,
  source_notice.target_url,
  source_notice.created_by,
  NULL,
  source_notice.resolved_at,
  source_notice.created_at,
  GETDATE()
FROM dbo.accounting_notifications source_notice
JOIN dbo.payments payment ON payment.id = source_notice.payment_id
JOIN dbo.users submitter ON submitter.id = payment.submitted_by AND submitter.is_active = 1
WHERE source_notice.notification_type IN ('sale_payment_approved', 'sale_payment_rejected')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.accounting_notifications existing
    WHERE existing.recipient_user_id = submitter.id
      AND existing.event_key = source_notice.event_key
  )
  AND source_notice.id = (
    SELECT MIN(canonical.id)
    FROM dbo.accounting_notifications canonical
    WHERE canonical.event_key = source_notice.event_key
  );
