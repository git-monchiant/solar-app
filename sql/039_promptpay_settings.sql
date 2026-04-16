-- Seed PromptPay settings. Admin can edit via /settings page.
-- promptpay_tax_id = SENA SOLAR's corporate tax ID (13 digits)

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_qr_enabled')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_qr_enabled', 'true');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_link_enabled')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_link_enabled', 'true');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_tax_id')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_tax_id', '0105552041258');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'company_name')
  INSERT INTO app_settings ([key], value) VALUES ('company_name', 'SENA SOLAR ENERGY CO., LTD.');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'company_short_name')
  INSERT INTO app_settings ([key], value) VALUES ('company_short_name', 'SENA SOLAR');

-- Clean up old keys replaced by the new promptpay_* names
DELETE FROM app_settings WHERE [key] IN ('payment_qr_enabled', 'payment_link_enabled');
GO
