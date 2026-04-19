-- Warranty battery list — JSON array of { brand, kwh, serial } so installs can
-- include multiple battery units (up to 5 in UI, but schema allows any count).
IF COL_LENGTH('leads', 'warranty_batteries') IS NULL
  ALTER TABLE leads ADD warranty_batteries NVARCHAR(MAX) NULL;
