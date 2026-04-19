-- Add warranty certificate upload columns:
--   - warranty_inverter_cert_url: PDF of inverter manufacturer warranty
--   - warranty_panel_cert_url:    PDF of panel manufacturer warranty
--   - warranty_panel_serials_url: PDF listing all panel serial numbers
IF COL_LENGTH('leads', 'warranty_inverter_cert_url') IS NULL
  ALTER TABLE leads ADD warranty_inverter_cert_url NVARCHAR(500) NULL;
IF COL_LENGTH('leads', 'warranty_panel_cert_url') IS NULL
  ALTER TABLE leads ADD warranty_panel_cert_url NVARCHAR(500) NULL;
IF COL_LENGTH('leads', 'warranty_panel_serials_url') IS NULL
  ALTER TABLE leads ADD warranty_panel_serials_url NVARCHAR(500) NULL;
