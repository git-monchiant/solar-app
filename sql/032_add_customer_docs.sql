-- Customer identity + document fields
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'id_card_number')
  ALTER TABLE leads ADD id_card_number NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'id_card_address')
  ALTER TABLE leads ADD id_card_address NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'meter_number')
  ALTER TABLE leads ADD meter_number NVARCHAR(30) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'id_card_photo_url')
  ALTER TABLE leads ADD id_card_photo_url NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'house_reg_photo_url')
  ALTER TABLE leads ADD house_reg_photo_url NVARCHAR(500) NULL;
GO
