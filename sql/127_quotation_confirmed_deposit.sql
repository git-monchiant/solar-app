-- Backfill draft quotations with the confirmed pre-survey payment credit.
-- Approved quotations remain immutable snapshots.
;WITH confirmed_deposit AS (
  SELECT
    l.id AS lead_id,
    CASE WHEN l.payment_confirmed = 1 THEN COALESCE(
      SUM(CASE
        WHEN p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL THEN p.amount
        ELSE NULL
      END),
      l.pre_total_price,
      0
    ) ELSE 0 END AS amount
  FROM leads l
  LEFT JOIN payments p ON p.lead_id = l.id
  GROUP BY l.id, l.payment_confirmed, l.pre_total_price
)
UPDATE q
SET
  deposit_paid_amount = applied.amount,
  outstanding_amount = net.amount,
  amount_before_vat = tax.before_vat,
  vat_amount = net.amount - tax.before_vat,
  updated_at = GETDATE()
FROM quotations q
JOIN confirmed_deposit confirmed ON confirmed.lead_id = q.lead_id
CROSS APPLY (
  SELECT CAST(
    CASE
      WHEN confirmed.amount > q.contract_total_incl_vat THEN q.contract_total_incl_vat
      WHEN confirmed.amount > q.deposit_paid_amount THEN confirmed.amount
      ELSE q.deposit_paid_amount
    END
  AS DECIMAL(12,2)) AS amount
) applied
CROSS APPLY (
  SELECT CAST(q.contract_total_incl_vat - applied.amount AS DECIMAL(12,2)) AS amount
) net
CROSS APPLY (
  SELECT CAST(ROUND(net.amount / 1.07, 2) AS DECIMAL(12,2)) AS before_vat
) tax
WHERE q.status IN ('draft', 'changes_required')
  AND (
    applied.amount <> q.deposit_paid_amount
    OR net.amount <> q.outstanding_amount
    OR tax.before_vat <> q.amount_before_vat
    OR net.amount - tax.before_vat <> q.vat_amount
  );
