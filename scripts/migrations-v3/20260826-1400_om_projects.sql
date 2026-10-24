-- ทะเบียนโครงการกลางของโมดูล O&M — ยึดตาม REM Sena/ProjectList (ระบบขายจริง)
-- แผน: docs/plans/20260826_01_map-ชื่อโครงการให้ถูกต้องด้วย-rem-projectlist.md
-- project_id เป็นรหัสของ REM เช่น 'K9BK3', '20100', '00300C' (สกัดจาก contract_id ได้ด้วย pattern S[O0]-{id}-)

CREATE TABLE dbo.om_projects (
  project_id   NVARCHAR(20)  NOT NULL CONSTRAINT PK_om_projects PRIMARY KEY,
  name_th      NVARCHAR(200) NOT NULL,
  name_en      NVARCHAR(200) NULL,
  project_type NVARCHAR(5)   NULL,          -- C = condo · H = house
  brand        NVARCHAR(100) NULL,
  is_demo      BIT           NOT NULL CONSTRAINT DF_om_projects_demo DEFAULT 0,  -- โครงการ *_Demo — ไม่ใช้จับคู่อัตโนมัติ
  source       NVARCHAR(20)  NOT NULL CONSTRAINT DF_om_projects_src DEFAULT 'rem', -- rem / manual
  synced_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_projects_sync DEFAULT SYSDATETIMEOFFSET()
);
GO
-- ผูกบ้านเข้าทะเบียน — คอลัมน์เดิม project_code/project_name เก็บไว้เป็นหลักฐานต้นทาง ไม่ลบ
ALTER TABLE dbo.om_houses ADD
  project_id NVARCHAR(20) NULL CONSTRAINT FK_om_houses_project REFERENCES dbo.om_projects(project_id),
  project_map_source NVARCHAR(20) NULL;  -- contract / code / name-approved / manual
GO
