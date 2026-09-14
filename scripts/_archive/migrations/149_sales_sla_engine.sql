-- 149: Sales SLA engine, contact retry playbook, and grade audit trail.
-- Forward-only and idempotent. Times are stored as local DATETIME2 because
-- this application and its mssql connection use Asia/Bangkok local time.

IF OBJECT_ID('dbo.sla_policies', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sla_policies (
    id INT IDENTITY(1,1) PRIMARY KEY,
    policy_code NVARCHAR(60) NOT NULL,
    version INT NOT NULL,
    name_th NVARCHAR(200) NOT NULL,
    policy_type NVARCHAR(30) NOT NULL,
    target_minutes INT NULL,
    warning_minutes INT NULL,
    deadline_rule NVARCHAR(60) NOT NULL,
    config_json NVARCHAR(MAX) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_sla_policies_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_sla_policies_created DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_sla_policies_updated DEFAULT GETDATE(),
    CONSTRAINT UQ_sla_policies_code_version UNIQUE (policy_code, version),
    CONSTRAINT CK_sla_policies_config_json CHECK (config_json IS NULL OR ISJSON(config_json) = 1)
  );
END;

IF OBJECT_ID('dbo.lead_sla_instances', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_sla_instances (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    lead_id INT NOT NULL,
    policy_code NVARCHAR(60) NOT NULL,
    policy_version INT NOT NULL,
    instance_key NVARCHAR(180) NOT NULL,
    task_name NVARCHAR(250) NOT NULL,
    owner_user_id INT NULL,
    started_at DATETIME2 NOT NULL,
    target_at DATETIME2 NOT NULL,
    due_at DATETIME2 NOT NULL,
    warning_at DATETIME2 NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_lead_sla_status DEFAULT 'active',
    completed_at DATETIME2 NULL,
    breached_at DATETIME2 NULL,
    superseded_at DATETIME2 NULL,
    completion_activity_id INT NULL,
    context_json NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_lead_sla_created DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_lead_sla_updated DEFAULT GETDATE(),
    CONSTRAINT FK_lead_sla_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT FK_lead_sla_owner FOREIGN KEY (owner_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_lead_sla_activity FOREIGN KEY (completion_activity_id) REFERENCES dbo.lead_activities(id),
    CONSTRAINT UQ_lead_sla_instance_key UNIQUE (instance_key),
    CONSTRAINT CK_lead_sla_status CHECK (status IN ('active','warning','critical','breached','completed','superseded','cancelled')),
    CONSTRAINT CK_lead_sla_context_json CHECK (context_json IS NULL OR ISJSON(context_json) = 1)
  );

  CREATE INDEX IX_lead_sla_work_queue
    ON dbo.lead_sla_instances(status, due_at, owner_user_id) INCLUDE (lead_id, policy_code, task_name);
  CREATE INDEX IX_lead_sla_lead
    ON dbo.lead_sla_instances(lead_id, created_at DESC);
END;

IF OBJECT_ID('dbo.lead_sla_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_sla_events (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sla_instance_id BIGINT NOT NULL,
    lead_id INT NOT NULL,
    event_type NVARCHAR(40) NOT NULL,
    event_key NVARCHAR(200) NULL,
    from_status NVARCHAR(20) NULL,
    to_status NVARCHAR(20) NULL,
    actor_user_id INT NULL,
    event_at DATETIME2 NOT NULL CONSTRAINT DF_lead_sla_events_at DEFAULT GETDATE(),
    detail_json NVARCHAR(MAX) NULL,
    CONSTRAINT FK_lead_sla_events_instance FOREIGN KEY (sla_instance_id) REFERENCES dbo.lead_sla_instances(id),
    CONSTRAINT FK_lead_sla_events_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT FK_lead_sla_events_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.users(id),
    CONSTRAINT CK_lead_sla_events_json CHECK (detail_json IS NULL OR ISJSON(detail_json) = 1)
  );

  CREATE UNIQUE INDEX UX_lead_sla_events_event_key
    ON dbo.lead_sla_events(event_key) WHERE event_key IS NOT NULL;
  CREATE INDEX IX_lead_sla_events_instance
    ON dbo.lead_sla_events(sla_instance_id, event_at DESC);
END;

IF OBJECT_ID('dbo.lead_grade_history', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_grade_history (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    lead_id INT NOT NULL,
    old_grade NVARCHAR(2) NULL,
    new_grade NVARCHAR(2) NULL,
    reason NVARCHAR(500) NULL,
    signal_activity_id INT NULL,
    changed_by INT NULL,
    changed_at DATETIME2 NOT NULL CONSTRAINT DF_lead_grade_history_changed DEFAULT GETDATE(),
    CONSTRAINT FK_lead_grade_history_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT FK_lead_grade_history_activity FOREIGN KEY (signal_activity_id) REFERENCES dbo.lead_activities(id),
    CONSTRAINT FK_lead_grade_history_user FOREIGN KEY (changed_by) REFERENCES dbo.users(id)
  );
  CREATE INDEX IX_lead_grade_history_lead ON dbo.lead_grade_history(lead_id, changed_at DESC);
END;

IF COL_LENGTH('dbo.lead_activities', 'contact_result') IS NULL
  ALTER TABLE dbo.lead_activities ADD contact_result NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.lead_activities', 'contact_outcome_code') IS NULL
  ALTER TABLE dbo.lead_activities ADD contact_outcome_code NVARCHAR(60) NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'FIRST_CONTACT' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('FIRST_CONTACT', 1, N'ติดต่อ Lead ครั้งแรก', 'response', 15, 30, 'BANGKOK_CONTACT_WINDOW',
    N'{"timezone":"Asia/Bangkok","dayWindow":"09:00-19:00","dayDeadline":"23:59:59","nightDeadline":"12:00:00","calendarDays":true}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'CONTACT_RETRY' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('CONTACT_RETRY', 1, N'ติดตามเมื่อติดต่อไม่ได้', 'playbook', NULL, 1440, 'CALENDAR_DAY_OFFSETS',
    N'{"offsetDays":[3,5,7,30],"anchor":"first_failed_attempt","calendarDays":true,"timezone":"Asia/Bangkok"}');

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'GRADE_A_NEXT_ACTION' AND version = 1)
  INSERT dbo.sla_policies(policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json)
  VALUES ('GRADE_A_NEXT_ACTION', 1, N'ดำเนินการ Lead Grade A', 'playbook', 1440, 240, 'ELAPSED_MINUTES',
    N'{"targetHours":24,"supersedePreviousGradeTasks":true}');

-- Existing open leads with no contact also enter the queue. This is safe to
-- re-run because instance_key is unique and the NOT EXISTS check is locked.
;WITH pending AS (
  SELECT
    l.id, l.source, l.assigned_user_id, l.created_at,
    CASE
      WHEN CAST(l.created_at AS TIME) >= '09:00:00' AND CAST(l.created_at AS TIME) < '19:00:00'
        THEN DATEADD(SECOND, 86399, CAST(CAST(l.created_at AS DATE) AS DATETIME2))
      WHEN CAST(l.created_at AS TIME) >= '19:00:00'
        THEN DATEADD(HOUR, 12, CAST(DATEADD(DAY, 1, CAST(l.created_at AS DATE)) AS DATETIME2))
      ELSE DATEADD(HOUR, 12, CAST(CAST(l.created_at AS DATE) AS DATETIME2))
    END AS due_at
  FROM dbo.leads l
  WHERE l.status NOT IN ('lost','returned','closed')
    AND NOT EXISTS (
      SELECT 1 FROM dbo.lead_activities a
      WHERE a.lead_id = l.id AND a.activity_type IN ('call','visit','line','other','follow_up')
    )
)
INSERT dbo.lead_sla_instances(
  lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id,
  started_at, target_at, due_at, warning_at, context_json
)
SELECT
  p.id, 'FIRST_CONTACT', 1, CONCAT('first-contact:', p.id), N'ติดต่อ Lead ครั้งแรก', p.assigned_user_id,
  p.created_at,
  CASE WHEN DATEADD(MINUTE, CASE WHEN p.source LIKE '%event%' OR p.source LIKE '%booth%' OR p.source LIKE '%referral%' THEN 1440 ELSE 15 END, p.created_at) > p.due_at
    THEN p.due_at
    ELSE DATEADD(MINUTE, CASE WHEN p.source LIKE '%event%' OR p.source LIKE '%booth%' OR p.source LIKE '%referral%' THEN 1440 ELSE 15 END, p.created_at)
  END,
  p.due_at, DATEADD(MINUTE, -30, p.due_at),
  CONCAT('{"source":', CASE WHEN p.source IS NULL THEN 'null' ELSE CONCAT('"', STRING_ESCAPE(p.source, 'json'), '"') END, ',"timezone":"Asia/Bangkok","backfilled":true}')
FROM pending p
WHERE NOT EXISTS (SELECT 1 FROM dbo.lead_sla_instances si WHERE si.instance_key = CONCAT('first-contact:', p.id));

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, to_status, event_at, detail_json)
SELECT si.id, si.lead_id, 'created', CONCAT('sla-created:', si.instance_key), 'active', si.created_at,
       N'{"source":"migration_backfill"}'
FROM dbo.lead_sla_instances si
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key = CONCAT('sla-created:', si.instance_key)
);

INSERT dbo.lead_sla_events(sla_instance_id, lead_id, event_type, event_key, from_status, to_status, event_at, detail_json)
SELECT si.id, si.lead_id,
       CASE WHEN si.status = 'breached' THEN 'breached' ELSE 'state_changed' END,
       CONCAT('sla-state:', si.id, ':', si.status), 'active', si.status,
       COALESCE(si.breached_at, si.updated_at), N'{"source":"migration_backfill"}'
FROM dbo.lead_sla_instances si
WHERE si.status IN ('warning','critical','breached')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key = CONCAT('sla-state:', si.id, ':', si.status)
  );
