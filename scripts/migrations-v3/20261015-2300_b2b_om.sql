-- O&M B2B เฟส 1: สัญญา + ตารางเข้างาน — แผน docs/plan/20261015-09-b2b-om.md
--   b2b_om_contracts   = สัญญา O&M ต่อโครงการ · สร้างเองตอนปิดโครงการ (om_years × om_visits_per_year จากใบที่ได้งาน · เริ่มวันส่งมอบ)
--                        seq 1 = รวมในราคาโครงการ · 2+ = ต่อสัญญา (เฟส 4)
--   b2b_om_visits      = ครั้งเข้างาน สร้างล่วงหน้าทั้งสัญญา กระจายเท่ากัน · planned → scheduled → done / skipped (ข้าม = ใช้สิทธิ์ครั้งนั้นแล้ว)
--   b2b_om_activities  = timeline ของสัญญา/ครั้ง
-- แยกจาก om_* (O&M บ้าน) ทั้งหมด — ทีม Solar B2B ทำเอง ปฏิทินแยก (เคาะ 15 ต.ค.) · สร้างตารางใหม่อย่างเดียว · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_om_contracts', 'U') IS NULL
  CREATE TABLE dbo.b2b_om_contracts (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    project_id       INT            NOT NULL CONSTRAINT FK_b2b_omc_proj REFERENCES dbo.b2b_projects(id),
    seq              INT            NOT NULL CONSTRAINT DF_b2b_omc_seq DEFAULT 1,
    source           VARCHAR(10)    NOT NULL CONSTRAINT DF_b2b_omc_source DEFAULT 'project'
                     CONSTRAINT CK_b2b_omc_source CHECK (source IN ('project', 'renewal')),
    start_date       DATE           NOT NULL,
    end_date         DATE           NOT NULL,
    years            INT            NOT NULL,
    visits_per_year  INT            NOT NULL,
    visits_total     INT            NOT NULL,
    contact_name     NVARCHAR(200)  NULL,      -- ผู้ประสานงานฝั่งลูกค้า (ตั้งต้นจากผู้ติดต่อของโครงการ)
    contact_phone    NVARCHAR(50)   NULL,
    note             NVARCHAR(1000) NULL,
    cancelled_at     DATETIMEOFFSET NULL,
    cancel_reason    NVARCHAR(500)  NULL,
    created_by       INT            NULL,
    created_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_omc_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by       INT            NULL,
    updated_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_omc_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_omc_seq UNIQUE (project_id, seq)
  );
GO

IF OBJECT_ID('dbo.b2b_om_visits', 'U') IS NULL
  CREATE TABLE dbo.b2b_om_visits (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    contract_id     INT            NOT NULL CONSTRAINT FK_b2b_omv_contract REFERENCES dbo.b2b_om_contracts(id),
    project_id      INT            NOT NULL CONSTRAINT FK_b2b_omv_proj REFERENCES dbo.b2b_projects(id),
    seq_no          INT            NOT NULL,   -- ครั้งที่ N ของสัญญา
    due_date        DATE           NOT NULL,   -- กำหนดตามรอบ (วันส่งมอบ + 12/ครั้งต่อปี เดือน × N)
    status          VARCHAR(12)    NOT NULL CONSTRAINT DF_b2b_omv_status DEFAULT 'planned'
                    CONSTRAINT CK_b2b_omv_status CHECK (status IN ('planned', 'scheduled', 'done', 'skipped')),
    scheduled_date  DATE           NULL,
    days            TINYINT        NULL,       -- จำนวนวันเข้างาน (ไซต์ใหญ่อาจหลายวัน)
    lead_user_id    INT            NULL,       -- ผู้รับผิดชอบ (Solar B2B)
    schedule_note   NVARCHAR(500)  NULL,
    done_date       DATE           NULL,
    result_note     NVARCHAR(1000) NULL,
    files_json      NVARCHAR(MAX)  NULL,       -- [{ file, name, mime }] รายงาน/รูป (storage/b2b-files)
    skip_reason     NVARCHAR(500)  NULL,
    closed_by       INT            NULL,
    closed_at       DATETIMEOFFSET NULL,
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_omv_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by      INT            NULL,
    updated_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_omv_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_omv_seq UNIQUE (contract_id, seq_no)
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_omv_status_due')
  CREATE INDEX IX_b2b_omv_status_due ON dbo.b2b_om_visits (status, due_date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_omv_sched')
  CREATE INDEX IX_b2b_omv_sched ON dbo.b2b_om_visits (scheduled_date) WHERE scheduled_date IS NOT NULL;
GO

IF OBJECT_ID('dbo.b2b_om_activities', 'U') IS NULL
  CREATE TABLE dbo.b2b_om_activities (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    contract_id  INT            NOT NULL CONSTRAINT FK_b2b_oma_contract REFERENCES dbo.b2b_om_contracts(id),
    visit_id     INT            NULL,
    kind         VARCHAR(30)    NOT NULL,
    message      NVARCHAR(1000) NULL,
    created_by   INT            NULL,
    created_at   DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_oma_created DEFAULT SYSDATETIMEOFFSET()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_oma_contract')
  CREATE INDEX IX_b2b_oma_contract ON dbo.b2b_om_activities (contract_id, created_at);
GO
