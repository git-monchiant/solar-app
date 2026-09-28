-- ใบงานซ่อมที่เปิดจากใบตรวจรับงาน (แผน docs/plan/20260924-02 เฟส 5 · ผู้ใช้เคาะ 28 ก.ย. 69)
--
-- ลำดับ: ช่างติ๊ก "พบงานซ่อม" + เล่าอาการในใบตรวจรับงาน → ปิดใบเดิมตามปกติ
--        → ทีม O&M เปิดใบงานใหม่ประเภทซ่อม ผูกกับใบเดิม + เลือกในประกัน/นอกประกัน
--   ในประกัน  = เส้นฟรี ข้ามเสนอราคา/ชำระเงิน ไปโทรนัดได้เลย
--   นอกประกัน = เริ่มที่ขั้นเสนอราคา (Sale ออกใบ → อนุมัติ → รับเงิน → นัด)
--
-- ★ nullable ทุกคอลัมน์ — ใบงานเดิมทั้งหมดไม่ใช่ใบซ่อมที่เปิดจากใบตรวจ ค่าว่างถูกต้องอยู่แล้ว

-- ใบงานต้นทาง — ใบซ่อมรู้ว่ามาจากงานไหน · ใบต้นทางรู้ว่าเปิดใบซ่อมไปแล้วหรือยัง
IF COL_LENGTH('dbo.om_bookings', 'parent_booking_id') IS NULL
  ALTER TABLE dbo.om_bookings ADD parent_booking_id INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_om_bookings_parent')
  ALTER TABLE dbo.om_bookings ADD CONSTRAINT FK_om_bookings_parent
    FOREIGN KEY (parent_booking_id) REFERENCES dbo.om_bookings(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_bookings_parent')
  CREATE INDEX IX_om_bookings_parent ON dbo.om_bookings(parent_booking_id)
    WHERE parent_booking_id IS NOT NULL;
GO

-- ในประกันการติดตั้ง — ทีม O&M เลือกตอนเปิดใบซ่อม (1 = ฟรี · 0 = ต้องเสนอราคา · NULL = ไม่ใช่ใบซ่อมแบบนี้)
IF COL_LENGTH('dbo.om_bookings', 'in_warranty') IS NULL
  ALTER TABLE dbo.om_bookings ADD in_warranty BIT NULL;
GO

-- ช่างแจ้งพบงานซ่อมในใบตรวจรับงาน — เก็บเป็นคอลัมน์ ไม่ยัดใน JSON checks
-- เพราะหน้างานบริการต้องกรอง "แจ้งแล้วแต่ยังไม่เปิดใบ" ได้โดยไม่ต้องแกะ JSON
IF COL_LENGTH('dbo.om_job_report', 'repair_needed') IS NULL
  ALTER TABLE dbo.om_job_report ADD repair_needed BIT NULL;
GO
IF COL_LENGTH('dbo.om_job_report', 'repair_detail') IS NULL
  ALTER TABLE dbo.om_job_report ADD repair_detail NVARCHAR(1000) NULL;
GO
