-- Store LINE users separately, map to leads later
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'line_users')
BEGIN
  CREATE TABLE line_users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    line_user_id NVARCHAR(100) NOT NULL UNIQUE,
    display_name NVARCHAR(200) NULL,
    picture_url NVARCHAR(500) NULL,
    lead_id INT NULL FOREIGN KEY REFERENCES leads(id),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    last_message_at DATETIME2 NULL
  );
END
GO
