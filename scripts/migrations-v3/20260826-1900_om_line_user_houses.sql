-- ลูกค้า 1 เบอร์มีได้หลายบ้าน (วัดจริง: 47 เบอร์ผูก 2-4 หลัง) — ตัวเชื่อม LINE user ↔ บ้าน หลายต่อหลาย
-- เกิดแถวตอน verify OTP สำเร็จ (ทุกบ้านของเบอร์นั้น) · om_line_users.house_id = "บ้านที่เลือกดูล่าสุด"
-- UI: แบบ A ตัวสลับบ้าน (mockup 20260826_04 — ผู้ใช้เคาะ 26 ส.ค.)

CREATE TABLE dbo.om_line_user_houses (
  line_user_id NVARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL,
  house_id     INT NOT NULL CONSTRAINT FK_om_luh_house REFERENCES dbo.om_houses(id),
  source       NVARCHAR(20) NOT NULL CONSTRAINT DF_om_luh_src DEFAULT 'otp',  -- otp / admin / test
  linked_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_luh_linked DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT PK_om_line_user_houses PRIMARY KEY (line_user_id, house_id)
);
GO
