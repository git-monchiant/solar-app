-- โครงการ B2B เฟส 4: ดำเนินโครงการ — แผน docs/plan/20261015-07-b2b-project-flow.md หัวข้อ 5
--   b2b_project_milestones = เหตุการณ์หน้างาน (สั่งของครบ · ของเข้า · แผงส่งครบ · เริ่ม/เสร็จติดตั้ง · ยื่นขนานไฟ · COD · ส่งมอบ)
--     1 ชนิดต่อโครงการ · บันทึกแล้วขยับขั้น/ทำให้งวดที่ผูกไว้ถึงกำหนดเอง · stage_before/after ไว้ถอยกลับตอนยกเลิกการบันทึกล่าสุด
--   b2b_project_permits = เช็กลิสต์ขออนุญาต 3 อย่างตามใบ SSE (แจ้งความประสงค์ อปท. · การไฟฟ้า · ดัดแปลงอาคาร)
-- สร้างตารางใหม่อย่างเดียว · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_project_milestones', 'U') IS NULL
  CREATE TABLE dbo.b2b_project_milestones (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    project_id    INT            NOT NULL CONSTRAINT FK_b2b_ms_proj REFERENCES dbo.b2b_projects(id),
    kind          VARCHAR(30)    NOT NULL
                  CONSTRAINT CK_b2b_ms_kind CHECK (kind IN ('procured', 'materials_arrived', 'panels_delivered', 'install_started',
                                                            'install_done', 'gridtie_submitted', 'cod', 'handover')),
    done_date     DATE           NOT NULL,
    note          NVARCHAR(500)  NULL,
    files_json    NVARCHAR(MAX)  NULL,       -- [{ file, name, mime }] รูป/ไฟล์หน้างาน (เก็บที่ storage/b2b-files)
    stage_before  INT            NOT NULL,
    stage_after   INT            NOT NULL,
    created_by    INT            NULL,
    created_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_ms_created DEFAULT SYSDATETIMEOFFSET(),
    updated_by    INT            NULL,
    updated_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_ms_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_ms_kind UNIQUE (project_id, kind)
  );
GO

IF OBJECT_ID('dbo.b2b_project_permits', 'U') IS NULL
  CREATE TABLE dbo.b2b_project_permits (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT            NOT NULL CONSTRAINT FK_b2b_permit_proj REFERENCES dbo.b2b_projects(id),
    kind            VARCHAR(20)    NOT NULL CONSTRAINT CK_b2b_permit_kind CHECK (kind IN ('local_notice', 'utility', 'building')),
    -- pending ยังไม่ยื่น · submitted ยื่นแล้วรอผล · approved ได้แล้ว · not_required ไม่ต้องใช้
    status          VARCHAR(15)    NOT NULL CONSTRAINT DF_b2b_permit_status DEFAULT 'pending'
                    CONSTRAINT CK_b2b_permit_status CHECK (status IN ('pending', 'submitted', 'approved', 'not_required')),
    submitted_date  DATE           NULL,
    approved_date   DATE           NULL,
    note            NVARCHAR(500)  NULL,
    file_name       NVARCHAR(300)  NULL,     -- เอกสารที่ได้ (ไฟล์เดียว · storage/b2b-files)
    file_label      NVARCHAR(200)  NULL,
    file_mime       NVARCHAR(100)  NULL,
    updated_by      INT            NULL,
    updated_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_permit_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_b2b_permit_kind UNIQUE (project_id, kind)
  );
GO
