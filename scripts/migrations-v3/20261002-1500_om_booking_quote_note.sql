-- บันทึกของขั้นเสนอราคา ระดับใบงาน O&M (แผน docs/plan/20261002-03-om-quote-note-like-sales.md · ผู้ใช้ขอ 2 ต.ค. 69)
--
-- ช่อง "บันทึกถึงฝ่ายขาย" ใต้การ์ดใบเสนอราคาแบบฝั่งขาย (ของขายเก็บที่ leads.quotation_note)
--   O&M ใช้ leads ไม่ได้ (บ้านที่ใช้ lead ร่วมกับฝั่งขาย บันทึกจะไปทับของทีมขาย)
--   และ om_bookings.note มีเจ้าของแล้ว (หมายเหตุนัด / อาการของใบงานซ่อม) ⇒ คอลัมน์แยก
-- ★ nullable — ใบงานเดิมไม่มีบันทึก

IF COL_LENGTH('dbo.om_bookings', 'quote_note') IS NULL
  ALTER TABLE dbo.om_bookings ADD quote_note NVARCHAR(2000) NULL;
GO
