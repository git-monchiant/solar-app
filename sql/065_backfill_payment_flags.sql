-- Backfill payment_confirmed / order_before_paid / order_after_paid flags
-- for historical leads that advanced past the relevant stage but whose
-- boolean flags weren't set (pre-dates the flag-based UI, or was migrated
-- from the old booking table).
--
-- Status is the source of truth: if a lead is in 'install' or beyond, the
-- before-install payment must have happened; if 'closed' with pct_before<100,
-- the after-install payment must have happened too. Treat pre_doc_no as
-- confirmation that the deposit was paid.

-- 1) Deposit paid when booking was created (pre_doc_no assigned)
UPDATE leads
SET payment_confirmed = 1
WHERE pre_doc_no IS NOT NULL AND (payment_confirmed = 0 OR payment_confirmed IS NULL);

-- 2) Before-install paid when the lead reached installation or later
UPDATE leads
SET order_before_paid = 1
WHERE status IN ('install', 'warranty', 'gridtie', 'closed')
  AND (order_before_paid = 0 OR order_before_paid IS NULL);

-- 3) After-install paid for closed leads that had a second installment
UPDATE leads
SET order_after_paid = 1
WHERE status = 'closed'
  AND (order_pct_before IS NULL OR order_pct_before < 100)
  AND (order_after_paid = 0 OR order_after_paid IS NULL);
