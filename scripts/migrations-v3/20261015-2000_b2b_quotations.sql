-- ใบเสนอราคา B2B + อนุมัติ 3 ชั้น — แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 2
--   1 แถว = 1 Revision (เลขที่เดียวกันทุก Rev แบบ BOQ) · อ้าง BOQ หนึ่ง Rev (boq_id)
--   เนื้อหาใบ (รายการเหมา · งวดเงิน · รับประกัน · หมายเหตุ · O&M) = content_json แก้ได้ตอนร่าง/ส่งกลับแก้
--   ส่งอนุมัติ = แช่ snapshot_json (หัวใบ · ลูกค้า · เนื้อหา · ยอด · ต้นทุน/ขายของ BOQ) — PDF ของใบที่ส่งแล้วพิมพ์จาก snapshot
--   ผู้ตรวจสอบ 3 ชั้นตามช่องลงชื่อในแม่แบบ SSE: ชื่อ/ตำแหน่ง/ลายเซ็นแช่ไว้ตอนกดอนุมัติ (แก้ลายเซ็นในโปรไฟล์ทีหลังไม่ย้อนเปลี่ยนใบ)
-- สร้างตารางใหม่อย่างเดียว · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_quotations', 'U') IS NULL
  CREATE TABLE dbo.b2b_quotations (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    project_id       INT            NOT NULL CONSTRAINT FK_b2b_quote_proj REFERENCES dbo.b2b_projects(id),
    boq_id           INT            NOT NULL CONSTRAINT FK_b2b_quote_boq REFERENCES dbo.b2b_boqs(id),
    doc_no           NVARCHAR(30)   NOT NULL,       -- SSE-MS-RPPS-yynnnn เท่ากันทุก Rev (แบบแม่แบบ)
    revision         INT            NOT NULL CONSTRAINT DF_b2b_quote_rev DEFAULT 0,
    root_id          INT            NULL,
    is_latest        BIT            NOT NULL CONSTRAINT DF_b2b_quote_latest DEFAULT 1,
    kind             VARCHAR(10)    NOT NULL CONSTRAINT CK_b2b_quote_kind CHECK (kind IN ('estimate', 'confirmed')),
    status           VARCHAR(20)    NOT NULL CONSTRAINT DF_b2b_quote_status DEFAULT 'draft'
                     CONSTRAINT CK_b2b_quote_status CHECK (status IN ('draft', 'pending_review1', 'pending_review2', 'pending_review3',
                                                                       'changes_required', 'approved', 'sent')),
    issue_date       DATE           NULL,           -- วันที่บนใบ = วันส่งอนุมัติ (ยืนยันราคาถึง = วันนี้ + validity_days)
    content_json     NVARCHAR(MAX)  NOT NULL,
    subtotal         DECIMAL(16,2)  NOT NULL CONSTRAINT DF_b2b_quote_sub DEFAULT 0,
    vat              DECIMAL(16,2)  NOT NULL CONSTRAINT DF_b2b_quote_vat DEFAULT 0,
    total            DECIMAL(16,2)  NOT NULL CONSTRAINT DF_b2b_quote_total DEFAULT 0,
    snapshot_json    NVARCHAR(MAX)  NULL,
    submitted_by     INT            NULL,
    submitted_at     DATETIMEOFFSET NULL,
    -- ผู้เสนอราคา (= คนส่งอนุมัติ) — แช่ตอนส่ง
    proposer_name    NVARCHAR(150)  NULL,
    proposer_sig     VARBINARY(MAX) NULL,
    proposer_sig_mime NVARCHAR(50)  NULL,
    -- ผู้ตรวจสอบ 1–3
    r1_by INT NULL, r1_at DATETIMEOFFSET NULL, r1_note NVARCHAR(1000) NULL, r1_name NVARCHAR(150) NULL, r1_sig VARBINARY(MAX) NULL, r1_sig_mime NVARCHAR(50) NULL,
    r2_by INT NULL, r2_at DATETIMEOFFSET NULL, r2_note NVARCHAR(1000) NULL, r2_name NVARCHAR(150) NULL, r2_sig VARBINARY(MAX) NULL, r2_sig_mime NVARCHAR(50) NULL,
    r3_by INT NULL, r3_at DATETIMEOFFSET NULL, r3_note NVARCHAR(1000) NULL, r3_name NVARCHAR(150) NULL, r3_sig VARBINARY(MAX) NULL, r3_sig_mime NVARCHAR(50) NULL,
    -- ส่งกลับแก้ล่าสุด (ชั้นไหน · ใคร · เหตุผล)
    returned_tier    INT            NULL,
    returned_by      INT            NULL,
    returned_at      DATETIMEOFFSET NULL,
    return_note      NVARCHAR(1000) NULL,
    sent_by          INT            NULL,
    sent_at          DATETIMEOFFSET NULL,
    created_by       INT            NULL,
    created_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_quote_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by       INT            NULL,
    updated_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_quote_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_quote_doc_rev UNIQUE (doc_no, revision)
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_quote_proj')
  CREATE INDEX IX_b2b_quote_proj ON dbo.b2b_quotations(project_id, is_latest, updated_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_quote_status')
  CREATE INDEX IX_b2b_quote_status ON dbo.b2b_quotations(status, is_latest);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_quote_boq')
  CREATE INDEX IX_b2b_quote_boq ON dbo.b2b_quotations(boq_id, status);
GO
