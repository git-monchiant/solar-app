-- โครงการ B2B เฟส 1 (แกนโครงการ) — แผน docs/plan/20261015-07-b2b-project-flow.md
--   b2b_customers          = บริษัทลูกค้า (1 บริษัทมีหลายโครงการ)
--   b2b_projects           = โครงการ · ขั้น (stage) เก็บเป็นคอลัมน์ · ขั้นย่อยคิดตอนอ่าน (src/lib/b2b/journey-sql.ts)
--   b2b_project_activities = timeline ของโครงการ
--   b2b_boqs (+ project_id · option_label) = 1 โครงการมีหลาย BOQ (ตัวเลือกขนาด) แต่ละตัวมี Rev ของตัวเอง
-- สร้างตาราง/เพิ่มคอลัมน์อย่างเดียว · รันซ้ำได้ · ใบเสนอราคา / งวดเงิน / milestone มาในเฟส 2–4

IF OBJECT_ID('dbo.b2b_customers', 'U') IS NULL
  CREATE TABLE dbo.b2b_customers (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(300)  NOT NULL,
    tax_id      NVARCHAR(20)   NULL,
    branch      NVARCHAR(100)  NULL,          -- "สำนักงานใหญ่" / "สาขา 00001"
    address     NVARCHAR(500)  NULL,
    created_by  INT            NULL,
    created_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_cust_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by  INT            NULL,
    updated_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_cust_updated DEFAULT SYSDATETIMEOFFSET()
  );
GO

IF OBJECT_ID('dbo.b2b_projects', 'U') IS NULL
  CREATE TABLE dbo.b2b_projects (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    code               NVARCHAR(20)   NOT NULL CONSTRAINT UQ_b2b_proj_code UNIQUE,   -- PRJyymm-nnn
    name               NVARCHAR(300)  NOT NULL,
    customer_id        INT            NOT NULL CONSTRAINT FK_b2b_proj_cust REFERENCES dbo.b2b_customers(id),
    contact_name       NVARCHAR(150)  NULL,     -- ผู้ติดต่อของโครงการ (หัวใบเสนอราคา "ผู้ติดต่อ")
    contact_phone      NVARCHAR(50)   NULL,
    contact_email      NVARCHAR(150)  NULL,
    location           NVARCHAR(500)  NULL,
    latitude           DECIMAL(9,6)   NULL,
    longitude          DECIMAL(9,6)   NULL,
    -- 3100 โอกาสขาย · 3200 ราคาประมาณการ · 3300 สำรวจ · 3400 ราคายืนยัน · 3500 ได้งาน · 3600 ขออนุญาต/จัดซื้อ
    -- 3700 ติดตั้ง · 3800 ขนานไฟ · 3900 ส่งมอบ · 3950 ปิดโครงการ · 3980 แพ้งาน · 3990 ยกเลิก
    stage              INT            NOT NULL CONSTRAINT DF_b2b_proj_stage DEFAULT 3100,
    stage_before_close INT            NULL,     -- ขั้นก่อนแพ้/ยกเลิก — ใช้ตอนเปิดกลับ
    close_reason       NVARCHAR(500)  NULL,
    closed_at          DATETIMEOFFSET NULL,
    owner_id           INT            NULL,     -- ผู้ดูแลโครงการ (users.id · role b2b)
    survey_date        DATE           NULL,     -- วันนัดสำรวจ
    surveyor_id        INT            NULL,
    survey_note        NVARCHAR(2000) NULL,     -- ผลสำรวจ
    survey_done_at     DATETIMEOFFSET NULL,
    note               NVARCHAR(1000) NULL,
    created_by         INT            NULL,
    created_at         DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_proj_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by         INT            NULL,
    updated_at         DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_proj_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT CK_b2b_proj_stage CHECK (stage IN (3100, 3200, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 3950, 3980, 3990))
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_proj_stage')
  CREATE INDEX IX_b2b_proj_stage ON dbo.b2b_projects(stage, updated_at DESC);
GO

IF OBJECT_ID('dbo.b2b_project_activities', 'U') IS NULL
  CREATE TABLE dbo.b2b_project_activities (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    project_id  INT            NOT NULL CONSTRAINT FK_b2b_pact_proj REFERENCES dbo.b2b_projects(id),
    kind        VARCHAR(30)    NOT NULL,      -- created · stage · survey_scheduled · survey_done · boq_created · boq_revision · lost · cancelled · reopened · edited · note
    from_stage  INT            NULL,
    to_stage    INT            NULL,
    message     NVARCHAR(1000) NULL,
    created_by  INT            NULL,
    created_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_pact_created DEFAULT SYSDATETIMEOFFSET()
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_pact_proj')
  CREATE INDEX IX_b2b_pact_proj ON dbo.b2b_project_activities(project_id, created_at DESC);
GO

IF COL_LENGTH('dbo.b2b_boqs', 'project_id') IS NULL
  ALTER TABLE dbo.b2b_boqs ADD project_id INT NULL CONSTRAINT FK_b2b_boq_proj REFERENCES dbo.b2b_projects(id);
GO

-- ชื่อตัวเลือกในโครงการ เช่น "998.64 kWp · Jinko 730" — ทุก Rev ของเลขที่เดียวกันใช้ชื่อเดียวกัน
IF COL_LENGTH('dbo.b2b_boqs', 'option_label') IS NULL
  ALTER TABLE dbo.b2b_boqs ADD option_label NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_boq_proj')
  CREATE INDEX IX_b2b_boq_proj ON dbo.b2b_boqs(project_id, is_latest);
GO
