-- Cache LINE profile pictures locally so the UI keeps working when LINE's
-- CDN URLs expire (they rotate every ~30-90 days when the user changes
-- avatar, which our `picture_url` doesn't track).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('line_users') AND name = 'picture_local_path')
BEGIN
  ALTER TABLE dbo.line_users ADD picture_local_path NVARCHAR(300) NULL;
END
GO
