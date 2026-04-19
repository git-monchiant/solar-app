-- Drop the legacy bookings table. The entity was superseded by pre_* columns
-- on leads (pre_doc_no, pre_package_id, pre_total_price, pre_booked_at, etc.)
-- in migrations 058/059, but the table itself was never dropped.
IF OBJECT_ID('bookings', 'U') IS NOT NULL DROP TABLE bookings;
