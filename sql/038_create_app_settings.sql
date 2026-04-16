IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.app_settings') AND type = 'U')
BEGIN
  CREATE TABLE app_settings (
    [key] NVARCHAR(100) NOT NULL PRIMARY KEY,
    value NVARCHAR(MAX) NOT NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'payment_qr_enabled')
  INSERT INTO app_settings ([key], value) VALUES ('payment_qr_enabled', 'true');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'payment_link_enabled')
  INSERT INTO app_settings ([key], value) VALUES ('payment_link_enabled', 'true');
GO
