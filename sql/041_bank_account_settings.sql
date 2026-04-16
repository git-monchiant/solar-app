-- Seed Bank Account settings. Admin can edit via /settings page.

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'bank_account_enabled')
  INSERT INTO app_settings ([key], value) VALUES ('bank_account_enabled', 'true');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'bank_account_bank')
  INSERT INTO app_settings ([key], value) VALUES ('bank_account_bank', 'TMBThanachart Bank');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'bank_account_branch')
  INSERT INTO app_settings ([key], value) VALUES ('bank_account_branch', 'Esplanade Ratchada');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'bank_account_number')
  INSERT INTO app_settings ([key], value) VALUES ('bank_account_number', '667-2-03155-3');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'bank_account_name')
  INSERT INTO app_settings ([key], value) VALUES ('bank_account_name', 'SENA SOLAR ENERGY CO., LTD.');
GO
