-- แจ้งเตือน B2B ในกระดิ่งกลาง (แผน docs/plan/20261015-11-b2b-approval-notifications.md)
--   แยกตารางจาก quotation_approval_notifications (ผูกใบ B2C + ลีด) และ "ไม่" ใส่ใน UNION ของ /api/notifications
--   (API กลางต่อ getDb() ที่อาจเป็นฐาน v2 — ตาราง v3 ใน batch เดียวกันทำกระดิ่งพังทุกคน แบบที่ O&M เลี่ยงไว้)
--   ⇒ /api/b2b/notifications (getB2bDb · v3 เท่านั้น) แล้วกระดิ่งดึงมารวมเองฝั่งหน้าจอ
--   kind: approval_requested (ถึงผู้ตรวจสอบชั้นที่รอ) · approval_completed / changes_required (ถึงคนส่งใบ)
--   resolved_at = ชั้นนั้นมีคนกดแล้ว (ของคนอื่นในชั้นเดียวกันปิดเอง · ไม่นับยังไม่อ่าน)
-- สร้างตารางใหม่อย่างเดียว · รันซ้ำได้

IF OBJECT_ID('dbo.b2b_notifications', 'U') IS NULL
  CREATE TABLE dbo.b2b_notifications (
    id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
    recipient_user_id  INT            NOT NULL,
    kind               VARCHAR(30)    NOT NULL,
    project_id         INT            NULL CONSTRAINT FK_b2b_notif_proj REFERENCES dbo.b2b_projects(id),
    quotation_id       INT            NULL CONSTRAINT FK_b2b_notif_quote REFERENCES dbo.b2b_quotations(id),
    tier               TINYINT        NULL,     -- ชั้นผู้ตรวจสอบที่รอ (approval_requested)
    title              NVARCHAR(250)  NOT NULL,
    message            NVARCHAR(1000) NULL,
    created_by         INT            NULL,
    created_at         DATETIMEOFFSET NOT NULL CONSTRAINT DF_b2b_notif_created DEFAULT SYSDATETIMEOFFSET(),
    read_at            DATETIMEOFFSET NULL,
    resolved_at        DATETIMEOFFSET NULL
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_notif_recipient')
  CREATE INDEX IX_b2b_notif_recipient ON dbo.b2b_notifications (recipient_user_id, read_at, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_b2b_notif_quote')
  CREATE INDEX IX_b2b_notif_quote ON dbo.b2b_notifications (quotation_id, kind, tier);
GO
