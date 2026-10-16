-- OTP ยืนยันตัวตนลูกค้า — ใช้ในหน้า MyHome (รวมกับหน้ายืนยันตัวตนเป็นหน้าเดียว ผู้ใช้ตัดสิน 27 ส.ค.)
-- เก็บ hash ไม่เก็บรหัสตรง ๆ · ผูกกับ line_user_id เพื่อกันเอา ref ของคนอื่นมาใช้
CREATE TABLE dbo.om_otp_requests (
  id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_otp PRIMARY KEY,
  ref          NVARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,  -- โชว์ให้ลูกค้าเทียบกับใน SMS
  line_user_id NVARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL,
  phone        NVARCHAR(20) NOT NULL,
  code_hash    NVARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL,  -- sha256(ref + code)
  attempts     INT NOT NULL CONSTRAINT DF_om_otp_att DEFAULT 0,
  expires_at   DATETIMEOFFSET NOT NULL,
  verified_at  DATETIMEOFFSET NULL,
  sent_via     NVARCHAR(20) NOT NULL CONSTRAINT DF_om_otp_via DEFAULT 'dev',  -- dev / smsmkt
  created_at   DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_otp_created DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT UQ_om_otp_ref UNIQUE (ref)
);
GO
CREATE INDEX IX_om_otp_user_time ON dbo.om_otp_requests (line_user_id, created_at DESC);
GO

-- คิวตรวจสอบตัวตน — เบอร์ที่ไม่อยู่ในทะเบียน ต้องให้แอดมินตรวจ (ตามที่ออกแบบใน mockup 20260826_06)
CREATE TABLE dbo.om_identity_requests (
  id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_idreq PRIMARY KEY,
  line_user_id NVARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL,
  phone        NVARCHAR(20) NULL,
  kind         NVARCHAR(20) NOT NULL,   -- phone_not_found / not_my_house
  house_id     INT NULL CONSTRAINT FK_om_idreq_house REFERENCES dbo.om_houses(id),
  note         NVARCHAR(400) NULL,
  status       NVARCHAR(20) NOT NULL CONSTRAINT DF_om_idreq_st DEFAULT 'open',  -- open / done / rejected
  handled_by   INT NULL,
  handled_at   DATETIMEOFFSET NULL,
  created_at   DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_idreq_created DEFAULT SYSDATETIMEOFFSET()
);
GO
CREATE INDEX IX_om_idreq_status ON dbo.om_identity_requests (status, created_at DESC);
GO
