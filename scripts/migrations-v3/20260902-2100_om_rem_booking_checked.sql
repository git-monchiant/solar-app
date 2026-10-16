-- ตัวจำว่า "ยิง BookingInfo เช็คสัญญานี้แล้ว" — กันวนซ้ำไม่รู้จบ
-- ทำไม: BookingInfo v2 ครอบสัญญาโอนได้ทุกใบ (ไม่ใช่แค่ SO-) แต่บางใบไม่มีของแถม/รูปแบบเก่า
--   ที่ API ตอบ error — พวกนี้ต้องมาร์คว่าเช็คแล้ว ไม่งั้นจะดึงซ้ำทุกรอบ (promo_synced_at ใช้ไม่ได้
--   เพราะสัญญาไม่มีของแถมจะไม่มีแถวให้อัปเดต)
-- ★ พบ 2 ก.ย.: บ้าน 22/29 K2KH สัญญา S0-K2KH-13030002 (ไม่ใช่ SO-) มีฟรีโซลาร์ 3.5kw ใน REM
--   แต่ v2 กรองแค่ SO- เลยข้าม · itf ก็ไม่ส่งมา ⇒ ต้องดึง BookingInfo ทุกสัญญาโอน 6,605 ใบที่ไม่ใช่ SO-

IF COL_LENGTH('dbo.om_rem_transfers','booking_checked_at') IS NULL
  ALTER TABLE dbo.om_rem_transfers ADD booking_checked_at DATETIMEOFFSET NULL;
GO
-- 1,581 สัญญา SO- ที่ดึง v2 ไปแล้ว มาร์คว่าเช็คแล้ว (มีแถว v2 = เช็คแล้วแน่)
UPDATE t SET booking_checked_at = SYSDATETIMEOFFSET()
FROM dbo.om_rem_transfers t
WHERE t.booking_checked_at IS NULL
  AND EXISTS (SELECT 1 FROM dbo.om_rem_promotions pr WHERE pr.contract_id = t.contract_id AND pr.source = 'v2');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_tr_booking_todo')
CREATE INDEX IX_om_rem_tr_booking_todo ON dbo.om_rem_transfers(booking_checked_at) INCLUDE (contract_id);
GO
