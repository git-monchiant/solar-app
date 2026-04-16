-- Re-create slip_files. Slips are kept in DB so they survive disk cleanups.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'slip_files')
BEGIN
  CREATE TABLE slip_files (
    id INT IDENTITY(1,1) PRIMARY KEY,
    lead_id INT NOT NULL,
    slip_field NVARCHAR(50) NOT NULL,
    data VARBINARY(MAX) NOT NULL,
    mime NVARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
    filename NVARCHAR(200) NULL,
    uploaded_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_slip_files_lead ON slip_files(lead_id, slip_field);
END
GO
