-- Lead 559 (พลเอก อภิชาต เพ็ญกิตติ) — drop orphan unconfirmed payment row.
--
-- Background: migration 020 moved ฿1,000 from VIP discount onto the booking
-- (pre_total_price 1000→2000, order_discount_amount 12130→11130). After that,
-- the payments table still had an unconfirmed "order_after_slip" row of
-- ฿12,130 ("ยอดคงค้าง") left over from a stale workflow attempt — never
-- confirmed, never represents money received. It was inflating the receipt /
-- step-summary totals (369,000 vs the correct 357,870 net).
--
-- This deletes that single orphan row only. Confirmed payments (booking +
-- both installments) stay untouched.
--
-- Idempotent: WHERE clause matches the exact orphan; re-running after delete
-- affects zero rows.

DELETE FROM dbo.payments
WHERE lead_id = 559
  AND slip_field = 'order_after_slip'
  AND amount = 12130
  AND confirmed_at IS NULL;
GO
