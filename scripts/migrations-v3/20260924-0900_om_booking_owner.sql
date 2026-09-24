-- เจ้าของเคสของใบงานบริการ (เฟส 4 · แผน docs/plan/20260922-01-om-align-with-sales-concept.md)
--
-- ทำไมต้องมี: ฝั่งขายมีเจ้าของ 3 ชั้นบน leads (assigned_user_id = เจ้าของเคส ·
--   survey_assigned_user_id · install_assigned_user_id = คนลงมือแต่ละช่วง)
--   หน้า Today ตอบ "วันนี้ฉันต้องทำอะไร" ได้เพราะมีช่องเจ้าของให้ค้นหา
--   O&M มีแต่ team_id (คนลงมือ) ไม่มีเจ้าของเคส ⇒ ถามไม่ได้ว่า "งาน O&M ของฉัน"
--   ⇒ นี่คือเหตุผลที่ O&M หายไปจาก Today ทั้งหมด
--
-- ★ ทีมช่าง (team_id) ยังเป็นฟิลด์แยกเหมือนเดิมตามที่ผู้ใช้เคาะ 7 ก.ย.
--   เจ้าของเคส = คนคุมงาน/คนโทร · ทีมช่าง = คนไปหน้างาน คนละหน้าที่ ไม่แทนกัน
-- ★ NULL = ยังไม่มีใครรับ — การ์ดยังขึ้นให้ทุกคนเห็นเหมือนเดิม
--   (ผู้ใช้เคาะ 10 ก.ย. "ใครเปิดหน้านี้ก็โทรต่อได้" ⇒ เจ้าของเป็นของเสริม ไม่ใช่ประตูล็อก)

IF COL_LENGTH('dbo.om_bookings', 'owner_user_id') IS NULL
  ALTER TABLE dbo.om_bookings ADD owner_user_id INT NULL;
GO

IF COL_LENGTH('dbo.om_bookings', 'owner_assigned_at') IS NULL
  ALTER TABLE dbo.om_bookings ADD owner_assigned_at DATETIMEOFFSET NULL;
GO

-- ใช้ตอบ "งานของฉัน" บนหน้า Today — กรองด้วยเจ้าของ + สถานะที่ยังค้าง
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_bookings_owner')
  CREATE INDEX IX_om_bookings_owner ON dbo.om_bookings(owner_user_id, status)
    INCLUDE (house_id, scheduled_at);
GO
