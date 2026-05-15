-- Carry per-payment discount + credit-card surcharge context on the payments
-- row itself, so receipts/reports don't have to re-derive them from leads.
--
-- payment_method already exists (used for "transfer" / "loan"); the "cc" value
-- is added by app code, no schema change needed for it.

ALTER TABLE payments
  ADD discount_pct          DECIMAL(5, 2)  NULL,
      discount_amount       DECIMAL(12, 2) NULL,
      discount_note         NVARCHAR(200)  NULL,
      cc_surcharge_pct      DECIMAL(5, 2)  NULL,
      cc_surcharge_amount   DECIMAL(12, 2) NULL;
