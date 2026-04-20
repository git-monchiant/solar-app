-- Allow up to 5 slip images per payment without creating a child table.
-- Slot 1 keeps the existing slip_data / slip_mime / slip_filename columns so
-- already-confirmed payments continue to work unchanged. Slots 2..5 are added
-- NULLable here and populated by /api/payments POST when staging has more than
-- one slip_files row for the (lead_id, slip_field) pair.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_data_2')
  ALTER TABLE payments ADD slip_data_2 VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_mime_2')
  ALTER TABLE payments ADD slip_mime_2 NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_filename_2')
  ALTER TABLE payments ADD slip_filename_2 NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_data_3')
  ALTER TABLE payments ADD slip_data_3 VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_mime_3')
  ALTER TABLE payments ADD slip_mime_3 NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_filename_3')
  ALTER TABLE payments ADD slip_filename_3 NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_data_4')
  ALTER TABLE payments ADD slip_data_4 VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_mime_4')
  ALTER TABLE payments ADD slip_mime_4 NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_filename_4')
  ALTER TABLE payments ADD slip_filename_4 NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_data_5')
  ALTER TABLE payments ADD slip_data_5 VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_mime_5')
  ALTER TABLE payments ADD slip_mime_5 NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'slip_filename_5')
  ALTER TABLE payments ADD slip_filename_5 NVARCHAR(200) NULL;
GO
