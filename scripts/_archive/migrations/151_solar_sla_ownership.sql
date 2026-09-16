-- 151: Separate Solar Survey/Installation SLA ownership from Sales owner.
-- Forward-only and idempotent. Development first; Production requires approval.

IF COL_LENGTH('dbo.leads', 'survey_assigned_user_id') IS NULL
  ALTER TABLE dbo.leads ADD survey_assigned_user_id INT NULL;
IF COL_LENGTH('dbo.leads', 'survey_assigned_at') IS NULL
  ALTER TABLE dbo.leads ADD survey_assigned_at DATETIME2 NULL;
IF COL_LENGTH('dbo.leads', 'install_assigned_user_id') IS NULL
  ALTER TABLE dbo.leads ADD install_assigned_user_id INT NULL;
IF COL_LENGTH('dbo.leads', 'install_assigned_at') IS NULL
  ALTER TABLE dbo.leads ADD install_assigned_at DATETIME2 NULL;
IF COL_LENGTH('dbo.lead_sla_instances', 'owner_role') IS NULL
  ALTER TABLE dbo.lead_sla_instances ADD owner_role NVARCHAR(30) NULL;

GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_leads_survey_assignee')
  ALTER TABLE dbo.leads ADD CONSTRAINT FK_leads_survey_assignee
    FOREIGN KEY (survey_assigned_user_id) REFERENCES dbo.users(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_leads_install_assignee')
  ALTER TABLE dbo.leads ADD CONSTRAINT FK_leads_install_assignee
    FOREIGN KEY (install_assigned_user_id) REFERENCES dbo.users(id);

-- Completed historical work can be attributed to its recorded actor. Active
-- work stays unassigned so the Solar queue can be claimed/assigned explicitly.
UPDATE dbo.leads
SET survey_assigned_user_id = survey_completed_by,
    survey_assigned_at = COALESCE(survey_assigned_at, survey_actual_date, updated_at)
WHERE survey_assigned_user_id IS NULL AND survey_completed_by IS NOT NULL;

UPDATE dbo.leads
SET install_assigned_user_id = install_completed_by,
    install_assigned_at = COALESCE(install_assigned_at, install_completed_at, updated_at)
WHERE install_assigned_user_id IS NULL AND install_completed_by IS NOT NULL;

UPDATE si
SET owner_role = CASE WHEN si.policy_code IN ('SITE_SURVEY','INSTALLATION') THEN 'solar' ELSE 'sales' END,
    owner_user_id = CASE
      WHEN si.policy_code = 'SITE_SURVEY' THEN l.survey_assigned_user_id
      WHEN si.policy_code = 'INSTALLATION' THEN l.install_assigned_user_id
      ELSE COALESCE(si.owner_user_id, l.assigned_user_id)
    END,
    updated_at = GETDATE()
FROM dbo.lead_sla_instances si
JOIN dbo.leads l ON l.id = si.lead_id;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.lead_sla_instances') AND name = 'IX_lead_sla_role_queue')
  CREATE INDEX IX_lead_sla_role_queue
    ON dbo.lead_sla_instances(owner_role, status, due_at, owner_user_id)
    INCLUDE (lead_id, policy_code, task_name);
