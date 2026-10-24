-- แจ้งเตือนงาน O&M (เฟส 6 ของแผน 20260922-01)
--
-- ★ ทำไมไม่ใช้ dbo.accounting_notifications ที่มีอยู่แล้ว
--   ตารางนั้น lead_id เป็น NOT NULL + FK ไป dbo.leads และคิวรีของมัน JOIN leads ตรง ๆ
--   งาน O&M ไม่มี lead — มีแต่บ้าน (om_houses) กับใบงาน (om_bookings)
--   ⇒ แยกตาราง แต่ใช้ "รูปคอลัมน์เดียวกันเป๊ะ" เพื่อให้ /api/notifications เอาไป UNION ต่อได้เลย
--     โดยไม่ต้องแก้โครงคิวรีเดิมของฝั่งขาย
--
-- ★ ไม่ผูก FK กับ om_houses/om_bookings โดยตั้งใจ
--   แจ้งเตือนเป็นบันทึกว่า "เคยบอกใครไปแล้ว" ถ้าใบงานถูกลบทีหลังก็ไม่ควรทำให้ลบไม่ผ่าน
--   (เทียบกับ accounting_notifications ที่ใช้ ON DELETE SET NULL ด้วยเหตุผลเดียวกัน)
--
-- ★ event_key = กันแจ้งซ้ำ · คีย์เดิมยิงซ้ำ = อัปเดตแถวเดิมแล้วปลุกให้ไม่อ่านใหม่
--   (คนละ pattern กับ insert รัว ๆ — กล่องแจ้งเตือนจะได้ไม่ถูกงานเดียวถล่ม)

IF OBJECT_ID('dbo.om_notifications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_notifications (
    id                BIGINT IDENTITY(1,1) PRIMARY KEY,
    house_id          INT NULL,
    booking_id        INT NULL,
    recipient_user_id INT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    event_key         NVARCHAR(160) NOT NULL,
    title             NVARCHAR(250) NOT NULL,
    message           NVARCHAR(1000) NULL,
    target_url        NVARCHAR(500) NOT NULL,
    created_by        INT NULL,
    read_at           DATETIME2 NULL,
    resolved_at       DATETIME2 NULL,
    created_at        DATETIME2 NOT NULL CONSTRAINT DF_omn_created DEFAULT GETDATE(),
    updated_at        DATETIME2 NOT NULL CONSTRAINT DF_omn_updated DEFAULT GETDATE(),
    CONSTRAINT FK_omn_recipient FOREIGN KEY (recipient_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_omn_creator   FOREIGN KEY (created_by)        REFERENCES dbo.users(id),
    CONSTRAINT UQ_omn_recipient_event UNIQUE (recipient_user_id, event_key)
  );

  -- กล่องแจ้งเตือนอ่านด้วย 2 คิวรีเท่านั้น: นับที่ยังไม่อ่าน กับ ดึง 100 รายการล่าสุดของฉัน
  CREATE INDEX IX_omn_recipient_unread
    ON dbo.om_notifications(recipient_user_id, resolved_at, read_at, created_at DESC);
  CREATE INDEX IX_omn_booking
    ON dbo.om_notifications(booking_id, notification_type, resolved_at);
END;
GO

-- รอบเตือนนัดล่วงหน้า — ทุกกติกาเป็น config ห้าม hardcode (ผู้ใช้เคาะ 31 ส.ค.)
MERGE dbo.om_settings AS t
USING (VALUES
  ('notify.assign_owner', 'true', N'เตือนเจ้าของเคสเมื่อถูกมอบหมายงาน',        'notify', 0, 61),
  ('notify.job_reminder', 'true', N'เตือนเจ้าของเคสก่อนถึงวันนัด',              'notify', 0, 62),
  ('notify.reminder_days', '1',   N'เตือนก่อนวันนัดกี่วัน (1 = เตือนเมื่อนัดพรุ่งนี้)', 'notify', 0, 63)
) AS s([key], value_json, label_th, group_key, pending_biz, sort_order)
ON t.[key] = s.[key]
WHEN NOT MATCHED THEN
  INSERT ([key], value_json, label_th, group_key, pending_biz, sort_order)
  VALUES (s.[key], s.value_json, s.label_th, s.group_key, s.pending_biz, s.sort_order);
GO
