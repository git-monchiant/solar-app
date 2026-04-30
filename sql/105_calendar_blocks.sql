-- Free-form calendar blocks ("other work" the appointment team should avoid).
-- Lets the calendar show non-lead events (training, holidays, internal jobs)
-- so dispatch can see when slots are taken.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'calendar_blocks')
BEGIN
  CREATE TABLE dbo.calendar_blocks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    title NVARCHAR(200) NOT NULL,
    block_date DATE NOT NULL,
    time_slot NVARCHAR(20) NULL,  -- 'morning' / 'afternoon' / NULL = all-day
    note NVARCHAR(MAX) NULL,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT GETDATE()
  );
  CREATE INDEX ix_calendar_blocks_date ON dbo.calendar_blocks(block_date);
END
GO
