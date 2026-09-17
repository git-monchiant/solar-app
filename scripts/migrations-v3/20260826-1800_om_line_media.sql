-- ไฟล์รูป/วิดีโอของแชต LINE O&M — LINE ต้องดึง media ผ่าน HTTPS URL สาธารณะ
-- จึงเก็บ blob ใน DB แล้วเสิร์ฟผ่าน /api/om/line/media/{token} (token สุ่ม เดาไม่ได้ · ไม่ใช้ id เรียงลำดับ)

CREATE TABLE dbo.om_line_media (
  id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_line_media PRIMARY KEY,
  token       NVARCHAR(48) COLLATE Latin1_General_BIN2 NOT NULL,  -- ใช้ใน URL — case-sensitive
  kind        NVARCHAR(10)  NOT NULL,                             -- image / video
  mime        NVARCHAR(60)  NOT NULL,
  bytes       VARBINARY(MAX) NOT NULL,
  size_bytes  INT           NOT NULL,
  source      NVARCHAR(10)  NOT NULL CONSTRAINT DF_om_line_media_src DEFAULT 'admin',  -- admin (เราส่ง) / line (ลูกค้าส่งมา)
  created_by  INT NULL,                                           -- admin user id (source=admin)
  created_at  DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_line_media_created DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT UQ_om_line_media_token UNIQUE (token),
  CONSTRAINT CK_om_line_media_kind CHECK (kind IN ('image','video'))
);
GO
