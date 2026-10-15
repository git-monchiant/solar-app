-- ไฟล์ของโครงการ B2B — เริ่มจากรูป/ไฟล์ผลสำรวจ (แผน docs/plan/20261015-10-b2b-survey-files.md)
--   1 แถว = 1 ไฟล์ (ลบทีละไฟล์ได้) · สำรวจซ้ำ (ถอยไปสำรวจ) ไฟล์เดิมยังอยู่ ต่อท้ายได้
--   kind: survey = ผลสำรวจ (รูปหลังคา · แบบ · ตู้ MDB · ไฟล์วัดพื้นที่) — ชนิดอื่นเพิ่มภายหลังด้วยการแก้ CHECK
--   ไฟล์อยู่ที่ storage/b2b-files (B2B_UPLOAD_DIR) แบบไฟล์อื่นของ B2B · สร้างตารางใหม่อย่างเดียว · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_project_files', 'U') IS NULL
  CREATE TABLE dbo.b2b_project_files (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    project_id  INT            NOT NULL CONSTRAINT FK_b2b_pfile_proj REFERENCES dbo.b2b_projects(id),
    kind        VARCHAR(20)    NOT NULL CONSTRAINT CK_b2b_pfile_kind CHECK (kind IN ('survey')),
    file_name   NVARCHAR(300)  NOT NULL,     -- ชื่อบนดิสก์ (buildB2bFileName)
    label       NVARCHAR(200)  NOT NULL,     -- ชื่อไฟล์เดิมที่ผู้ใช้แนบ
    mime        NVARCHAR(100)  NOT NULL,
    note        NVARCHAR(300)  NULL,
    created_by  INT            NULL,
    created_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_pfile_created DEFAULT SYSDATETIMEOFFSET()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_pfile_proj')
  CREATE INDEX IX_b2b_pfile_proj ON dbo.b2b_project_files (project_id, kind, created_at);
GO
