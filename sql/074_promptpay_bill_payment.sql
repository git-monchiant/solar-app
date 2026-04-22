-- PromptPay Bill Payment (via Digio) settings.
-- Mode switches /api/qr between Credit Transfer (tax id) and Bill Payment (biller id).

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_mode')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_mode', 'bill_payment');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_biller_id')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_biller_id', '010753700001716');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_ref1')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_ref1', '87UX');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_ref2')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_ref2', '86289573');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_merchant_name')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_merchant_name', 'Digio');

IF NOT EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'promptpay_terminal')
  INSERT INTO app_settings ([key], value) VALUES ('promptpay_terminal', 'SDGO862842802640220');
GO
