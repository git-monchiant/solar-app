-- ช่วงราคาของแพ็คเกจบริการ O&M — ยกกติกาจาก package_price_periods ของฝั่งขายทั้งชุด
--   หลายช่วงราคาต่อแพ็คเกจ · ใช้งาน (Active) ได้ครั้งละ 1 ช่วง · ระบบสลับเองตามวันที่
--   ช่วงที่ Active หรือเริ่มไปแล้วแก้ไม่ได้ ต้องเพิ่มช่วงใหม่ในอนาคต
--   ราคาของช่วงที่ Active ถูก mirror กลับไป om_packages.price (แคตตาล็อกอ่านจากตรงนั้น)

IF OBJECT_ID('dbo.om_package_price_periods', 'U') IS NULL
  CREATE TABLE dbo.om_package_price_periods (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    om_package_id INT NOT NULL CONSTRAINT FK_om_ppp_package REFERENCES dbo.om_packages(id),
    price         DECIMAL(12,2) NOT NULL,
    start_date    DATE NULL,
    expire_date   DATE NULL,
    is_active     BIT  NOT NULL CONSTRAINT DF_om_ppp_active DEFAULT 0,
    created_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_ppp_created DEFAULT SYSDATETIMEOFFSET(),
    created_by    INT NULL
  );
GO

-- Active ได้ครั้งละ 1 ช่วงต่อแพ็คเกจ (เหมือน UX_ppp_one_active ฝั่งขาย)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_om_ppp_one_active')
  CREATE UNIQUE INDEX UX_om_ppp_one_active ON dbo.om_package_price_periods(om_package_id) WHERE is_active = 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_ppp_package')
  CREATE INDEX IX_om_ppp_package ON dbo.om_package_price_periods(om_package_id, start_date);
GO

-- แพ็คเกจที่มีอยู่แล้วได้ช่วงแรกจากราคาปัจจุบัน = ทั้งเดือนที่สร้าง (ผู้ใช้เคาะ 24 ก.ย. 69: 1–30 ก.ย.)
INSERT INTO dbo.om_package_price_periods (om_package_id, price, start_date, expire_date, is_active)
SELECT p.id, p.price, DATEFROMPARTS(YEAR(p.created_at), MONTH(p.created_at), 1), EOMONTH(CAST(p.created_at AS DATE)), 1
FROM dbo.om_packages p
WHERE NOT EXISTS (SELECT 1 FROM dbo.om_package_price_periods x WHERE x.om_package_id = p.id);
GO
