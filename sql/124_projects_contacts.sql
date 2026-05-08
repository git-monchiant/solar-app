-- Per-project contact info imported from "E-mail หมู่บ้านแต่ละโครงการ.xlsx".
-- Single primary contact per project (ผู้จัดการชุมชน / นิติบุคคล) — extra
-- columns store the supporting emails/phones that come from the same row.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'assignee_title')
  ALTER TABLE dbo.projects ADD assignee_title NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'assignee_email')
  ALTER TABLE dbo.projects ADD assignee_email NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'assignee_phone')
  ALTER TABLE dbo.projects ADD assignee_phone NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'juristic_email')
  ALTER TABLE dbo.projects ADD juristic_email NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'juristic_phone')
  ALTER TABLE dbo.projects ADD juristic_phone NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'am_email')
  ALTER TABLE dbo.projects ADD am_email NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.projects') AND name = 'contact_note')
  ALTER TABLE dbo.projects ADD contact_note NVARCHAR(500) NULL;
GO
