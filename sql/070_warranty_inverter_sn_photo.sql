-- Photo of the inverter serial number plate (proof attachment for warranty)
IF COL_LENGTH('leads', 'warranty_inverter_sn_photo_url') IS NULL
  ALTER TABLE leads ADD warranty_inverter_sn_photo_url NVARCHAR(500) NULL;
