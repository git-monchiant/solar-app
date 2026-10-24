-- ต่อจาก 20260909-1700: ใบตัดสิทธิ์ก็ต้องรู้ว่าตัดสิทธิ์ของงานชนิดไหน
-- ไม่งั้นพอขายแพ็คตรวจเช็ก การตัดสิทธิ์ตรวจจะไปโผล่ในสถิติ "ล้างล่าสุด / จำนวนครั้งที่ล้าง"
--   NULL = ล้างแผง (เหมือนตาราง grants) แต่รอบนี้เติมค่าจริงลงไปให้หมด จะได้ไม่ต้องเดา
DECLARE @cleaning INT = (SELECT TOP 1 id FROM om_service_type WHERE code = 'cleaning');
IF @cleaning IS NULL THROW 50000, N'ไม่พบประเภทงาน cleaning ใน om_service_type', 1;

IF COL_LENGTH('om_redemptions', 'service_type_id') IS NULL
  ALTER TABLE om_redemptions ADD service_type_id INT NULL;
GO

DECLARE @cleaning INT = (SELECT TOP 1 id FROM om_service_type WHERE code = 'cleaning');
-- ของเดิมทั้งหมดเป็นล้างแผง (redemption 3,041 · grant 1,804) — เติมให้ชัด ไม่ต้องพึ่ง ISNULL
UPDATE om_redemptions       SET service_type_id = @cleaning WHERE service_type_id IS NULL;
UPDATE om_entitlement_grants SET service_type_id = @cleaning WHERE service_type_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_om_redemptions_type')
  ALTER TABLE om_redemptions ADD CONSTRAINT FK_om_redemptions_type
    FOREIGN KEY (service_type_id) REFERENCES om_service_type(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_om_entitlement_grants_type')
  ALTER TABLE om_entitlement_grants ADD CONSTRAINT FK_om_entitlement_grants_type
    FOREIGN KEY (service_type_id) REFERENCES om_service_type(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_redemptions_type')
  CREATE INDEX IX_om_redemptions_type ON om_redemptions (installation_id, service_type_id) INCLUDE (service_date, status);
GO
