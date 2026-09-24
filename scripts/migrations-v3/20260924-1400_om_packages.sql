-- แพ็คเกจบริการ O&M (การ์ด "Package O&M" หมวด SETUP บนหน้า home)
--
-- 1 แถว = 1 ตัวเลือกราคา · ขั้นขนาดระบบ (kw_min–kw_max / แผงไม่เกิน) ซ้ำกันได้หลายแถว
--   เช่น 2.00–5.00 kW มี 2 แถว: รายครั้ง 2,200 · สัญญา 12 เดือน เข้า 2 ครั้ง 3,500
--   หน้าแคตตาล็อกจัดกลุ่มด้วย (kw_min, kw_max, max_panels) เอง ไม่ต้องมีตารางขั้นแยก
-- หมายเหตุท้ายตารางแยกเป็น om_package_notes — om_settings เก็บได้แค่ตัวเลข/true-false

IF OBJECT_ID('dbo.om_packages', 'U') IS NULL
  CREATE TABLE dbo.om_packages (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    kw_min          DECIMAL(6,2)  NOT NULL,
    kw_max          DECIMAL(6,2)  NOT NULL,
    max_panels      INT           NULL,
    -- per_visit = รายครั้ง · contract = สัญญา (ใช้ contract_months + visits)
    plan_type       VARCHAR(20)   NOT NULL CONSTRAINT CK_om_packages_plan_type CHECK (plan_type IN ('per_visit', 'contract')),
    contract_months INT           NULL,
    visits          INT           NULL,
    price           DECIMAL(12,2) NOT NULL,
    scope           NVARCHAR(500) NULL,
    is_active       BIT           NOT NULL CONSTRAINT DF_om_packages_active DEFAULT 1,
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_packages_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at      DATETIMEOFFSET NULL,
    updated_by      INT           NULL
  );
GO

IF OBJECT_ID('dbo.om_package_notes', 'U') IS NULL
  CREATE TABLE dbo.om_package_notes (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    body       NVARCHAR(1000) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_om_package_notes_sort DEFAULT 0,
    updated_at DATETIMEOFFSET NULL,
    updated_by INT NULL
  );
GO

-- ราคาตั้งต้นจากตารางค่าบริการ O&M ที่ผู้ใช้ส่งมา (24 ก.ย. 69) — ใส่เฉพาะตอนตารางยังว่าง
IF NOT EXISTS (SELECT 1 FROM dbo.om_packages)
  INSERT INTO dbo.om_packages (kw_min, kw_max, max_panels, plan_type, contract_months, visits, price, scope) VALUES
    (2.00,  5.00,  10, 'per_visit', NULL, NULL, 2200, N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน'),
    (2.00,  5.00,  10, 'contract',  12,   2,    3500, N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน+ตรวจเช็คตามการแจ้งซ่อมระหว่างสัญญา'),
    (5.01,  10.00, 20, 'per_visit', NULL, NULL, 3000, N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน'),
    (5.01,  10.00, 20, 'contract',  12,   2,    5000, N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน+ตรวจเช็คตามการแจ้งซ่อมระหว่างสัญญา'),
    (10.01, 20.00, 50, 'per_visit', NULL, NULL, 4000, N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน'),
    (10.01, 20.00, 50, 'contract',  12,   2,    6000, N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน+ตรวจเช็คตามการแจ้งซ่อมระหว่างสัญญา');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.om_package_notes)
  INSERT INTO dbo.om_package_notes (body, sort_order) VALUES
    (N'ค่าบริการดังกล่าวไม่รวมค่าวัสดุอุปกรณ์ของระบบผลิตพลังงานโซลาร์เซลล์ทุกกรณี เมื่อเริ่มเข้าให้บริการ จนท.จะตรวจสอบการทำงานของระบบและแจ้งผลการตรวจสอบให้ลูกค้าทราบ', 1),
    (N'ก่อนการขึ้นล้างแผง การให้บริการจะเก็บค่าบริการก่อนการนัดหมายและเข้าหน้างาน หากระบบไม่สามารถใช้งานได้หรือมีอุปกรณ์ชำรุดก่อนการเข้าให้บริการจะถือเป็นค่าใช้จ่ายของลูกค้า', 2);
GO
