-- O&M: ธง VIP รายบ้าน — ตามแผน docs แผน 20260828_01 ข้อ 4.6 (ตัวเลือก ก)
-- VIP เป็น "ระดับลูกค้า" แยกจาก segment ซึ่งสื่อประเภทสิ่งปลูกสร้าง
IF COL_LENGTH('om_houses', 'is_vip') IS NULL
BEGIN
  ALTER TABLE om_houses ADD is_vip BIT NOT NULL CONSTRAINT DF_om_houses_is_vip DEFAULT 0;
END
GO

-- segment เดิม NVARCHAR(10) ใส่ 'sales_office' (12 ตัว) ไม่ได้ — ขยายเป็น 20
-- ★ มี IX_om_houses_segment_solar เกาะอยู่ ต้อง drop → alter → สร้างกลับ
IF COL_LENGTH('om_houses', 'segment') = 20   -- NVARCHAR(10) = 20 ไบต์
BEGIN
  DROP INDEX IX_om_houses_segment_solar ON om_houses;
  ALTER TABLE om_houses ALTER COLUMN segment NVARCHAR(20) NOT NULL;
  CREATE INDEX IX_om_houses_segment_solar ON om_houses (segment, has_solar);
END
GO
