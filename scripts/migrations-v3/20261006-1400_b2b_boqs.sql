-- ใบ BOQ ของโมดูล B2B — แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 3
--   b2b_boqs       = หัวใบ 1 แถวต่อ 1 revision (เลขที่เดียวกัน · Rev 0, 1, 2 …) · แก้ได้เฉพาะ Rev ล่าสุด
--   b2b_boq_items  = บรรทัด · เก็บ snapshot ชื่อ/รุ่น/ราคาจาก Master ตอนเลือก (Purchase แก้ราคาทีหลังไม่ย้อนเปลี่ยนใบ)
-- ยอดรวมบนหัวใบ = ค่าที่ระบบคำนวณตอนบันทึก (ไว้แสดงในหน้ารายการ) — ตัวจริงคำนวณสดจากบรรทัดทุกครั้ง
-- สร้างตารางใหม่อย่างเดียว · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_boqs', 'U') IS NULL
  CREATE TABLE dbo.b2b_boqs (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    doc_no         NVARCHAR(30)   NOT NULL,       -- BOQyymm-nnn เท่ากันทุก revision
    revision       INT            NOT NULL CONSTRAINT DF_b2b_boq_rev DEFAULT 0,
    root_id        INT            NULL,           -- id ของ Rev 0 (Rev 0 เองเป็น NULL)
    is_latest      BIT            NOT NULL CONSTRAINT DF_b2b_boq_latest DEFAULT 1,
    project_name   NVARCHAR(300)  NOT NULL,
    customer_name  NVARCHAR(300)  NULL,
    location       NVARCHAR(500)  NULL,
    latitude       DECIMAL(9,6)   NULL,
    longitude      DECIMAL(9,6)   NULL,
    margin_pct     DECIMAL(6,3)   NOT NULL CONSTRAINT DF_b2b_boq_margin DEFAULT 15,
    vat_pct        DECIMAL(5,2)   NOT NULL CONSTRAINT DF_b2b_boq_vat DEFAULT 7,
    addon_modes    NVARCHAR(400)  NULL,           -- JSON {"19":"included","20":"optional"} · หมวดเสริมที่ใส่ในใบ
    note           NVARCHAR(1000) NULL,
    capacity_wp    DECIMAL(14,2)  NULL,
    total_cost     DECIMAL(16,2)  NULL,           -- ก่อน VAT (มาตรฐาน + ส่วนเสริมที่รวมในราคา)
    total_sale     DECIMAL(16,2)  NULL,
    pending_lines  INT            NOT NULL CONSTRAINT DF_b2b_boq_pending DEFAULT 0,
    created_by     INT            NULL,
    created_at     DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_boq_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by     INT            NULL,
    updated_at     DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_boq_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_boq_doc_rev UNIQUE (doc_no, revision)
  );
GO

IF OBJECT_ID('dbo.b2b_boq_items', 'U') IS NULL
  CREATE TABLE dbo.b2b_boq_items (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    boq_id           INT            NOT NULL CONSTRAINT FK_b2b_boqi_boq REFERENCES dbo.b2b_boqs(id),
    category_id      INT            NOT NULL CONSTRAINT FK_b2b_boqi_cat REFERENCES dbo.b2b_categories(id),
    sort_order       INT            NOT NULL CONSTRAINT DF_b2b_boqi_sort DEFAULT 0,
    -- material = เลือกจาก Master (ราคามาจาก Purchase) · manual = Solar B2B ใส่ราคาเอง (หมวดเสริม 19–25 เท่านั้น)
    line_type        VARCHAR(10)    NOT NULL CONSTRAINT CK_b2b_boqi_type CHECK (line_type IN ('material','manual')),
    material_id      INT            NULL CONSTRAINT FK_b2b_boqi_mat REFERENCES dbo.b2b_materials(id),
    subgroup         NVARCHAR(200)  NULL,
    name             NVARCHAR(300)  NOT NULL,
    brand            NVARCHAR(150)  NULL,
    model            NVARCHAR(300)  NULL,
    unit             NVARCHAR(30)   NOT NULL,
    spec_watt        DECIMAL(10,2)  NULL,
    price_basis      VARCHAR(20)    NOT NULL
                     CONSTRAINT CK_b2b_boqi_basis CHECK (price_basis IN ('unit','watt','system_wp','pct_category','pct_sale')),
    unit_cost        DECIMAL(14,4)  NULL,         -- NULL = รายการ Master ที่ยังรอราคา
    qty              DECIMAL(14,3)  NOT NULL CONSTRAINT DF_b2b_boqi_qty DEFAULT 1,
    note             NVARCHAR(500)  NULL,
    price_entered_by INT            NULL          -- ผู้ใส่ราคาเอง (manual)
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_boqi_boq')
  CREATE INDEX IX_b2b_boqi_boq ON dbo.b2b_boq_items(boq_id, category_id, sort_order);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_boq_latest')
  CREATE INDEX IX_b2b_boq_latest ON dbo.b2b_boqs(is_latest, updated_at DESC);
GO
