-- โครงการ B2B เฟส 3: ได้งาน + งวดเงิน — แผน docs/plan/20261015-07-b2b-project-flow.md
--   b2b_quotations.status + 'won' (ใบที่ได้งาน = สัญญา) · 'closed' (ใบอื่นของโครงการปิดเองตอนได้งาน)
--   b2b_projects + ข้อมูลสัญญา (ใบ/BOQ ที่ได้งาน · เลข PO/สัญญา · วันลงนาม · มูลค่า) + สิทธิ์ O&M จากใบ
--   b2b_project_installments = งวดเงินคัดลอกจากใบที่ได้งาน · Solar B2B แนบหลักฐาน → บัญชียืนยัน
-- เพิ่มคอลัมน์/ตาราง + เปลี่ยน CHECK ของสถานะใบ · รันซ้ำได้

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_b2b_quote_status')
  ALTER TABLE dbo.b2b_quotations DROP CONSTRAINT CK_b2b_quote_status;
GO
ALTER TABLE dbo.b2b_quotations ADD CONSTRAINT CK_b2b_quote_status
  CHECK (status IN ('draft', 'pending_review1', 'pending_review2', 'pending_review3', 'changes_required', 'approved', 'sent', 'won', 'closed'));
GO

IF COL_LENGTH('dbo.b2b_projects', 'won_quote_id') IS NULL
  ALTER TABLE dbo.b2b_projects ADD
    won_quote_id       INT            NULL CONSTRAINT FK_b2b_proj_wonq REFERENCES dbo.b2b_quotations(id),
    won_boq_id         INT            NULL CONSTRAINT FK_b2b_proj_wonb REFERENCES dbo.b2b_boqs(id),   -- งบต้นทุนของโครงการ (Purchase ใช้สั่งของ — เฟส 4)
    contract_no        NVARCHAR(100)  NULL,       -- เลข PO / สัญญาของลูกค้า
    contract_date      DATE           NULL,       -- วันลงนาม · NULL = ได้งานแล้วแต่ยังไม่เซ็น (ขั้นย่อย 3510)
    contract_value     DECIMAL(16,2)  NULL,       -- มูลค่าสัญญาก่อน VAT = ราคาในใบที่ได้งาน
    contract_vat_pct   DECIMAL(5,2)   NULL,
    won_at             DATETIMEOFFSET NULL,
    won_by             INT            NULL,
    om_years           INT            NULL,       -- สิทธิ์ O&M ที่รวมในราคา (เก็บไว้ให้โมดูล O&M B2B ภายหลัง)
    om_visits_per_year INT            NULL;
GO

IF OBJECT_ID('dbo.b2b_project_installments', 'U') IS NULL
  CREATE TABLE dbo.b2b_project_installments (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT            NOT NULL CONSTRAINT FK_b2b_inst_proj REFERENCES dbo.b2b_projects(id),
    no              INT            NOT NULL,
    pct             DECIMAL(6,2)   NOT NULL,
    condition       NVARCHAR(300)  NOT NULL,
    -- เหตุการณ์ที่ทำให้ถึงกำหนด (milestone เฟส 4): contract · panels_delivered · install_done · handover · NULL = กดเอง
    trigger_key     VARCHAR(30)    NULL,
    amount          DECIMAL(16,2)  NOT NULL,      -- ก่อน VAT
    vat             DECIMAL(16,2)  NOT NULL,
    total           DECIMAL(16,2)  NOT NULL,
    -- pending ยังไม่ถึง → due ถึงกำหนดวางบิล → submitted แนบหลักฐานรอบัญชี → paid รับเงินแล้ว (บัญชีตีกลับ = due)
    status          VARCHAR(12)    NOT NULL CONSTRAINT DF_b2b_inst_status DEFAULT 'pending'
                    CONSTRAINT CK_b2b_inst_status CHECK (status IN ('pending', 'due', 'submitted', 'paid')),
    due_at          DATETIMEOFFSET NULL,
    received_date   DATE           NULL,          -- วันที่ลูกค้าโอน/จ่าย (ตามหลักฐาน)
    evidence_file   NVARCHAR(300)  NULL,          -- ไฟล์หลักฐาน (ที่เก็บไฟล์ของระบบ)
    evidence_name   NVARCHAR(200)  NULL,
    evidence_mime   NVARCHAR(100)  NULL,
    submit_note     NVARCHAR(500)  NULL,
    submitted_by    INT            NULL,
    submitted_at    DATETIMEOFFSET NULL,
    confirmed_by    INT            NULL,
    confirmed_at    DATETIMEOFFSET NULL,
    reject_note     NVARCHAR(500)  NULL,
    rejected_by     INT            NULL,
    rejected_at     DATETIMEOFFSET NULL,
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_inst_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_inst_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_inst_no UNIQUE (project_id, no)
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_inst_status')
  CREATE INDEX IX_b2b_inst_status ON dbo.b2b_project_installments(status, project_id);
GO
