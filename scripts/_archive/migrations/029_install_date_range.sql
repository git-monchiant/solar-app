-- Install can now span multiple days. install_date stays as the start date
-- (existing single-day data interprets fine); install_date_end is the new
-- end-date column. NULL end-date = single-day install (backwards-compat).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'install_date_end')
BEGIN
  ALTER TABLE dbo.leads ADD install_date_end DATE NULL;
END
GO
