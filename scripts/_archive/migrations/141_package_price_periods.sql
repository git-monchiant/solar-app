-- 141: ช่วงราคาขายของ Package (package_price_periods)
--
-- เดิมราคาขาย/ผ่อนต่อเดือน/ประหยัดต่อเดือน + วันเริ่ม-วันหมดอายุ เก็บอยู่บน
-- ตาราง packages ชุดเดียว ทำให้เก็บประวัติการปรับราคาไม่ได้ (เช่น 7 kWp 1 เฟส
-- + Battery เคยขาย 290,000 ตอนนี้ 306,000 แต่ไม่มีร่องรอยว่าเปลี่ยนเมื่อไหร่)
--
-- ตารางนี้ให้ 1 package มีได้หลายช่วงราคา แต่ active ได้ครั้งละ 1 ช่วงเท่านั้น
-- (บังคับด้วย filtered unique index) ค่าในแถวที่ active จะถูก mirror กลับไปที่
-- packages.price/monthly_installment/monthly_saving/start_date/expire_date
-- เพื่อให้โค้ดเดิมทั้งหมด (ใบเสนอราคา, dropdown เลือก package, dashboard)
-- ทำงานต่อได้โดยไม่ต้องแก้
--
-- idempotent: สร้างเมื่อยังไม่มี และ backfill เฉพาะ package ที่ยังไม่มีช่วงราคา

IF OBJECT_ID('package_price_periods', 'U') IS NULL
BEGIN
  CREATE TABLE package_price_periods (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    package_id          INT            NOT NULL,
    price               DECIMAL(12, 2) NOT NULL CONSTRAINT DF_ppp_price DEFAULT (0),
    monthly_installment NVARCHAR(20)   NULL,
    monthly_saving      DECIMAL(10, 2) NULL,
    start_date          DATE           NULL,
    expire_date         DATE           NULL,
    is_active           BIT            NOT NULL CONSTRAINT DF_ppp_active DEFAULT (0),
    note                NVARCHAR(200)  NULL,
    created_at          DATETIME       NOT NULL CONSTRAINT DF_ppp_created DEFAULT (GETDATE()),
    created_by          INT            NULL,
    CONSTRAINT FK_ppp_package FOREIGN KEY (package_id) REFERENCES packages(id)
  );

  CREATE INDEX IX_ppp_package ON package_price_periods(package_id, is_active);

  -- active ได้ package ละ 1 ช่วงเท่านั้น
  CREATE UNIQUE INDEX UX_ppp_one_active
    ON package_price_periods(package_id)
    WHERE is_active = 1;
END

-- backfill: package ที่ยังไม่มีช่วงราคาเลย → สร้างจากค่าปัจจุบันบน packages
INSERT INTO package_price_periods (package_id, price, monthly_installment, monthly_saving, start_date, expire_date, is_active, note)
SELECT p.id, ISNULL(p.price, 0), p.monthly_installment, p.monthly_saving, p.start_date, p.expire_date, 1, N'ย้ายจากข้อมูลเดิม'
FROM packages p
WHERE NOT EXISTS (SELECT 1 FROM package_price_periods x WHERE x.package_id = p.id);
