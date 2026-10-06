-- Master Data วัสดุของโมดูล BOQ (B2B) — แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 2
--   b2b_categories       = 25 หมวดของ BOQ (ตาม sheet EPCL - BOQS) · 19–25 = ส่วนเพิ่มเติม (Optional Add-on)
--   b2b_materials        = รายการ Master · Solar B2B กรอกข้อมูล · Purchase ใส่ราคา (unit_price NULL = รอราคา)
--   b2b_material_prices  = ประวัติราคา (ทุกครั้งที่ Purchase ใส่/ปรับ)
-- สร้างตารางใหม่อย่างเดียว ไม่แตะตารางเดิม · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_categories', 'U') IS NULL
  CREATE TABLE dbo.b2b_categories (
    id          INT           NOT NULL PRIMARY KEY,   -- = เลขหมวดในไฟล์ BOQ (1–25)
    name        NVARCHAR(200) NOT NULL,
    is_addon    BIT           NOT NULL CONSTRAINT DF_b2b_cat_addon DEFAULT 0,
    sort_order  INT           NOT NULL
  );
GO

-- ชื่อหมวดตามไฟล์ต้นฉบับ · 11 กับ 23 ชื่อซ้ำกันในไฟล์ (มาตรฐาน / ส่วนเพิ่มเติม) — หน้าจอแสดงเลขหมวดนำหน้าเสมอ
MERGE dbo.b2b_categories AS t
USING (VALUES
  (1,  N'Solar Cell PV Module', 0),
  (2,  N'Inverter', 0),
  (3,  N'Mounting & Walkway', 0),
  (4,  N'Solar Control box & MDB Modify & Zero Export', 0),
  (5,  N'Monitoring System', 0),
  (6,  N'DC Cable & Accessories', 0),
  (7,  N'AC Cable & Accessories', 0),
  (8,  N'Ground Cable & System', 0),
  (9,  N'Conduit and Perforated Tray', 0),
  (10, N'PV Cleaning System', 0),
  (11, N'Inverter Station', 0),
  (12, N'Service & Safety', 0),
  (13, N'Operation & Maintenance', 0),
  (14, N'Civil Work & Other', 0),
  (15, N'Accessories', 0),
  (16, N'Optional & Optimizer', 0),
  (17, N'Installation', 0),
  (18, N'Engineering Management & Permit & Insurance', 0),
  (19, N'งานเสริมโครงสร้างอาคารรองรับระบบโซลาร์เซลล์ (Structural Reinforcement Work)', 1),
  (20, N'ระบบล่อฟ้า (Lightning Protection System)', 1),
  (21, N'งาน High Voltage Equipment', 1),
  (22, N'ค่าแรงรื้อถอนระบบโซล่าร์เซลล์เดิม (Existing Solar)', 1),
  (23, N'Inverter Station', 1),
  (24, N'MDB Room', 1),
  (25, N'Battery Energy', 1)
) AS s (id, name, is_addon)
ON t.id = s.id
WHEN NOT MATCHED THEN INSERT (id, name, is_addon, sort_order) VALUES (s.id, s.name, s.is_addon, s.id);
GO

IF OBJECT_ID('dbo.b2b_materials', 'U') IS NULL
  CREATE TABLE dbo.b2b_materials (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    -- รหัสไม่ซ้ำ ผูกกับ id จึงไม่เปลี่ยนแม้ย้ายหมวด (ไฟล์ Excel ใช้ชื่อรุ่นเป็นกุญแจ แล้วชื่อซ้ำกันได้)
    code             AS ('M' + RIGHT('00000' + CAST(id AS VARCHAR(10)), 5)) PERSISTED,
    category_id      INT            NOT NULL CONSTRAINT FK_b2b_mat_category REFERENCES dbo.b2b_categories(id),
    subgroup         NVARCHAR(200)  NULL,      -- หัวข้อย่อย เช่น End Clamp / Rail / L-Feet
    name             NVARCHAR(300)  NOT NULL,  -- รายการ
    brand            NVARCHAR(150)  NULL,
    model            NVARCHAR(300)  NULL,      -- รุ่น / ขนาด
    spec_watt        DECIMAL(10,2)  NULL,      -- วัตต์ต่อแผง (ใช้กับแบบราคา watt)
    unit             NVARCHAR(30)   NOT NULL,
    -- unit = บาท/หน่วย · watt = บาท/W ของแผง · system_wp = บาท/Wp ของระบบ
    -- pct_category = % ของต้นทุนหมวด · pct_sale = % ของยอดขายหมวด 1–17
    price_basis      VARCHAR(20)    NOT NULL CONSTRAINT DF_b2b_mat_basis DEFAULT 'unit'
                     CONSTRAINT CK_b2b_mat_basis CHECK (price_basis IN ('unit','watt','system_wp','pct_category','pct_sale')),
    unit_price       DECIMAL(14,4)  NULL,      -- NULL = รอราคา (Purchase ยังไม่ใส่)
    warranty         NVARCHAR(200)  NULL,
    note             NVARCHAR(500)  NULL,
    sort_order       INT            NOT NULL CONSTRAINT DF_b2b_mat_sort DEFAULT 0,
    is_active        BIT            NOT NULL CONSTRAINT DF_b2b_mat_active DEFAULT 1,
    source           NVARCHAR(50)   NULL,      -- ที่มาตอนนำเข้า (ว่าง = เพิ่มจากหน้าจอ)
    created_by       INT            NULL,
    created_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_mat_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by       INT            NULL,
    updated_at       DATETIMEOFFSET NULL,
    price_updated_by INT            NULL,
    price_updated_at DATETIMEOFFSET NULL
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_mat_category')
  CREATE INDEX IX_b2b_mat_category ON dbo.b2b_materials(category_id, sort_order, id);
GO

IF OBJECT_ID('dbo.b2b_material_prices', 'U') IS NULL
  CREATE TABLE dbo.b2b_material_prices (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    material_id  INT            NOT NULL CONSTRAINT FK_b2b_price_material REFERENCES dbo.b2b_materials(id),
    old_price    DECIMAL(14,4)  NULL,
    new_price    DECIMAL(14,4)  NULL,
    note         NVARCHAR(500)  NULL,
    changed_by   INT            NULL,
    changed_at   DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_price_changed DEFAULT SYSDATETIMEOFFSET()
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_price_material')
  CREATE INDEX IX_b2b_price_material ON dbo.b2b_material_prices(material_id, changed_at DESC);
GO
