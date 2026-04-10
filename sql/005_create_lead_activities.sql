USE solardb;
GO

CREATE TABLE lead_activities (
    id INT IDENTITY(1,1) PRIMARY KEY,
    lead_id INT NOT NULL FOREIGN KEY REFERENCES leads(id),
    activity_type NVARCHAR(30) NOT NULL,
    -- Types: 'call', 'visit', 'follow_up', 'status_change', 'note', 'booking_created'
    title NVARCHAR(200) NOT NULL,
    note NVARCHAR(MAX),
    old_status NVARCHAR(30),
    new_status NVARCHAR(30),
    follow_up_date DATETIME2,
    created_by INT FOREIGN KEY REFERENCES users(id),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IX_lead_activities_created ON lead_activities(lead_id, created_at DESC);

-- Seed initial "Lead created" activities for existing leads
INSERT INTO lead_activities (lead_id, activity_type, title, created_at)
SELECT id, 'note', 'Lead created', created_at FROM leads;

PRINT 'lead_activities table created and seeded';
GO
