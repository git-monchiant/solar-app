-- ตารางแชต LINE ของโมดูล O&M — แยกจาก dbo.line_users/line_messages ของระบบขายโดยสิ้นเชิง
-- ใช้กับ LINE channel ทดสอบก่อน (คีย์ OM_LINE_*) แล้วค่อยสลับเป็น channel จริงเมื่อได้รับอนุมัติ
-- line_user_id ต้อง case-sensitive (Thai_CI_AS ของฐานไม่สนตัวพิมพ์) → COLLATE Latin1_General_BIN2

CREATE TABLE dbo.om_line_users (
  id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_line_users PRIMARY KEY,
  line_user_id    NVARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL,
  display_name    NVARCHAR(200) NULL,
  picture_url     NVARCHAR(500) NULL,
  phone           NVARCHAR(20)  NULL,             -- เบอร์ที่เดา/สกัดได้ ยังไม่ถือเป็นยืนยัน
  customer_id     INT NULL CONSTRAINT FK_om_line_users_customer REFERENCES dbo.om_customers(id),
  house_id        INT NULL CONSTRAINT FK_om_line_users_house    REFERENCES dbo.om_houses(id),
  identity_status NVARCHAR(20) NOT NULL CONSTRAINT DF_om_line_users_ident DEFAULT 'unknown',
                  -- unknown / lead (มีใน dbo.line_users ฝั่งขาย) / matched (เดาได้) / verified (OTP แล้ว)
  is_follow       BIT NOT NULL CONSTRAINT DF_om_line_users_follow DEFAULT 1,
  channel_mode    NVARCHAR(10) NOT NULL CONSTRAINT DF_om_line_users_mode DEFAULT 'test',  -- test / prod
  last_message_at DATETIMEOFFSET NULL,
  created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_line_users_created DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT UQ_om_line_users_line_id UNIQUE (line_user_id)
);
GO
CREATE TABLE dbo.om_line_messages (
  id              BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_line_messages PRIMARY KEY,
  line_user_id    NVARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL,
  direction       NVARCHAR(3)  NOT NULL,          -- in = ลูกค้าส่งมา · out = แอดมินตอบ
  message_type    NVARCHAR(30) NOT NULL CONSTRAINT DF_om_line_messages_type DEFAULT 'text',
  text            NVARCHAR(MAX) NULL,
  payload         NVARCHAR(MAX) NULL,             -- event ดิบจาก LINE (sticker/image/location ฯลฯ)
  line_message_id NVARCHAR(100) NULL,
  admin_user_id   INT NULL,                       -- ผู้ส่งฝั่งเรา (direction=out)
  is_read         BIT NOT NULL CONSTRAINT DF_om_line_messages_read DEFAULT 0,
  created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_line_messages_created DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT CK_om_line_messages_payload CHECK (payload IS NULL OR ISJSON(payload) = 1),
  CONSTRAINT CK_om_line_messages_dir CHECK (direction IN ('in','out'))
);
GO
CREATE INDEX IX_om_line_messages_user_time ON dbo.om_line_messages (line_user_id, created_at DESC);
GO
