-- Backfill payments rows for historical leads whose paid flags were set by
-- sql/065_backfill_payment_flags.sql without creating a transaction record.
-- Keeps accounting reports consistent (received = sum of payments.amount).
--
-- Historical rows have no slip image — allow NULL on slip_data / slip_mime /
-- slip_filename so backfilled rows can exist without a BLOB.

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID('payments') AND c.name = 'slip_data' AND c.is_nullable = 0)
  ALTER TABLE payments ALTER COLUMN slip_data VARBINARY(MAX) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID('payments') AND c.name = 'slip_mime' AND c.is_nullable = 0)
  ALTER TABLE payments ALTER COLUMN slip_mime NVARCHAR(50) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID('payments') AND c.name = 'slip_filename' AND c.is_nullable = 0)
  ALTER TABLE payments ALTER COLUMN slip_filename NVARCHAR(200) NULL;
GO

-- Step 1: pre-survey deposit
INSERT INTO payments (lead_id, step_no, slip_field, doc_no, amount, description, confirmed_by)
SELECT l.id, 1, 'pre_slip_url', l.pre_doc_no + '-0', l.pre_total_price, 'ค่าสำรวจ (backfill)', 'system'
FROM leads l
WHERE l.payment_confirmed = 1
  AND l.pre_doc_no IS NOT NULL
  AND l.pre_total_price IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = l.id AND p.step_no = 1);
GO

-- Step 3: before-install installment (order_total * pct_before / 100, or full order_total if no split)
INSERT INTO payments (lead_id, step_no, slip_field, doc_no, amount, description, confirmed_by)
SELECT l.id, 3, 'order_before_slip',
       l.pre_doc_no + '-1',
       CAST(l.order_total * ISNULL(l.order_pct_before, 100) / 100.0 AS DECIMAL(12,2)),
       'ชำระก่อนติดตั้ง (backfill)',
       'system'
FROM leads l
WHERE l.order_before_paid = 1
  AND l.order_total IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = l.id AND p.step_no = 3);
GO

-- Step 4: after-install installment (remaining order_total + install_extra_cost,
-- with the pre-survey deposit deducted — matches the "หักค่าสำรวจ" line in InstallStep).
INSERT INTO payments (lead_id, step_no, slip_field, doc_no, amount, description, confirmed_by)
SELECT l.id, 4, 'order_after_slip',
       l.pre_doc_no + '-2',
       CAST(l.order_total - (l.order_total * ISNULL(l.order_pct_before, 100) / 100.0)
            - ISNULL(l.pre_total_price, 0)
            + ISNULL(l.install_extra_cost, 0) AS DECIMAL(12,2)),
       'ชำระหลังติดตั้ง (backfill)',
       'system'
FROM leads l
WHERE l.order_after_paid = 1
  AND l.order_total IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = l.id AND p.step_no = 4);
GO
