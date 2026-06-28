-- รูปติดตั้งเพิ่มเติม — a second install-photo bucket separate from the
-- main install_photos field. Lets the Photos tab on the lead detail page
-- offer an "อัปโหลดรูปติดตั้งเพิ่ม" upload zone without polluting the
-- canonical install_photos list that the install step manages.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'install_photos_extra')
  ALTER TABLE dbo.leads ADD install_photos_extra NVARCHAR(MAX) NULL;
GO
