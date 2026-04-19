-- Drop the legacy bookings table. All data has been migrated to leads.pre_* by 058.
-- Run AFTER verifying leads.pre_doc_no is populated for every lead that had a booking.
IF OBJECT_ID('bookings', 'U') IS NOT NULL
  DROP TABLE bookings;
GO
