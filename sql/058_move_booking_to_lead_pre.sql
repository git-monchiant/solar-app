-- Move booking fields onto leads under the pre_ prefix so the bookings table can retire.
-- The bookings table is left intact in this migration — dropped in a later one after all
-- consumers have been updated to read from leads.pre_*.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_doc_no')
  ALTER TABLE leads ADD pre_doc_no NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_total_price')
  ALTER TABLE leads ADD pre_total_price DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_package_id')
  ALTER TABLE leads ADD pre_package_id INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_note')
  ALTER TABLE leads ADD pre_note NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_booked_at')
  ALTER TABLE leads ADD pre_booked_at DATETIME2 NULL;
GO

-- payment_confirmed flag lived on bookings. The /api/payments route + UI read it as a
-- direct lead column, so the physical column moves here (no pre_ prefix — this flag
-- stays independent of whether a booking row was created).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'payment_confirmed')
  ALTER TABLE leads ADD payment_confirmed BIT NOT NULL CONSTRAINT DF_leads_payment_confirmed DEFAULT 0;
GO

-- Copy existing booking data onto leads. Takes the latest booking row per lead (id DESC).
UPDATE l
SET
  l.pre_doc_no         = b.booking_number,
  l.pre_total_price    = b.total_price,
  l.pre_package_id     = b.package_id,
  l.pre_note           = b.note,
  l.pre_booked_at      = b.created_at,
  l.payment_confirmed  = ISNULL(b.payment_confirmed, 0)
FROM leads l
JOIN (
  SELECT lead_id, booking_number, total_price, package_id, note, created_at, payment_confirmed,
         ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY id DESC) AS rn
  FROM bookings
) b ON b.lead_id = l.id AND b.rn = 1
WHERE l.pre_doc_no IS NULL;
GO

CREATE INDEX IX_leads_pre_doc_no ON leads(pre_doc_no) WHERE pre_doc_no IS NOT NULL;
GO
