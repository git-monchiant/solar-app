-- Responsible staff for each project (from the Lead Seeker sheet, column
-- "เจ้าหน้าที่ผู้ดูแล"). One name per project. Free text — no FK to users.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'assignee')
  ALTER TABLE projects ADD assignee NVARCHAR(100) NULL;
GO
