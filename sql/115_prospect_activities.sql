-- Audit trail for prospect changes — mirrors the lead_activities pattern.
-- Right now prospects.updated_at + visited_at give us "what changed last" but
-- not "who did it" or "what changed". This table fills that gap so we can
-- reconstruct who marked a prospect as interested, who added a contact, etc.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'prospect_activities')
BEGIN
  CREATE TABLE prospect_activities (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    prospect_id  INT NOT NULL,
    activity_type NVARCHAR(50) NOT NULL, -- 'created' | 'visit' | 'interest_change' | 'note' | 'contact_change' | 'lead_link' | etc.
    title        NVARCHAR(500) NULL,
    note         NVARCHAR(MAX) NULL,
    old_value    NVARCHAR(500) NULL,    -- for *_change types: prior state
    new_value    NVARCHAR(500) NULL,    -- for *_change types: new state
    created_by   INT NULL,              -- FK to users.id (nullable — system actions)
    created_at   DATETIME2 NOT NULL CONSTRAINT DF_prospect_activities_created DEFAULT GETDATE(),
    CONSTRAINT FK_prospect_activities_prospect FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_prospect_activities_prospect ON prospect_activities(prospect_id, created_at DESC);
  CREATE INDEX IX_prospect_activities_user ON prospect_activities(created_by, created_at DESC);
END;
