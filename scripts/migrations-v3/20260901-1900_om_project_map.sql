-- สะพานโครงการ: ทะเบียนของระบบขาย (dbo.projects) ↔ ทะเบียน REM (om_projects)
-- ทำไมต้องมี: dbo.projects ไม่มีคอลัมน์รหัส REM และชื่อตรงกันแค่ 35/68
-- ตัดสิน 1 ก.ย.: เรา map เอง ไม่ขอทีมเขาเพิ่มคอลัมน์ (จะได้ไม่กระทบ schema ของเขา)
-- ใช้ตอน sweep: leads.project_id → rem_project_id → หาบ้านในทะเบียน REM

IF OBJECT_ID('dbo.om_project_map') IS NULL
CREATE TABLE dbo.om_project_map (
  sales_project_id INT           NOT NULL CONSTRAINT PK_om_project_map PRIMARY KEY,  -- dbo.projects.id
  rem_project_id   NVARCHAR(20)  NULL CONSTRAINT FK_om_project_map_rem REFERENCES dbo.om_projects(project_id),
  match_type       NVARCHAR(20)  NOT NULL,   -- exact | similar | manual | outside (ไม่ใช่โครงการเสนา)
  sales_name       NVARCHAR(200) NULL,       -- ชื่อฝั่งขายตอน map ไว้ดูย้อน
  note             NVARCHAR(300) NULL,
  confirmed_by     INT           NULL,       -- คนยืนยัน (NULL = ยังเป็นการเดาของระบบ)
  created_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_project_map_at DEFAULT SYSDATETIMEOFFSET(),
  updated_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_project_map_up DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT CK_om_project_map_type CHECK (match_type IN ('exact','similar','manual','outside'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_project_map_rem')
CREATE INDEX IX_om_project_map_rem ON dbo.om_project_map(rem_project_id);
GO
