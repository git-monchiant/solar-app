-- One-off adjustment for lead 559 (พลเอก อภิชาต เพ็ญกิตติ): move ฿1,000 from
-- the VIP discount onto the booking (ค่าสำรวจ). Customer's total balance
-- stays the same — only how the deduction is itemised changes.
--
--   pre_total_price        : 1,000  → 2,000     (+1,000)
--   order_discount_amount  : 12,130 → 11,130    (−1,000)
--   order_discount_pct     : 3.27   → 3.00      (recomputed: 11130/371000)
--
-- Idempotent: WHERE-clause guard ensures the UPDATE only fires when the
-- before-state still matches, so re-running has no effect.
UPDATE dbo.leads
SET pre_total_price       = 2000,
    order_discount_amount = 11130,
    order_discount_pct    = 3.00,
    updated_at            = SYSUTCDATETIME()
WHERE id = 559
  AND pre_total_price = 1000
  AND order_discount_amount = 12130;
GO

PRINT 'lead 559: shifted ฿1,000 from discount to ค่าสำรวจ';
GO
