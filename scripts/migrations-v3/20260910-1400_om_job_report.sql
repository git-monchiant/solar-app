-- ใบตรวจรับงานหน้างาน — ตารางเดียวจบ (ผู้ใช้สั่ง 10 ก.ย. 69 "อย่าสร้างตารางเยอะ")
-- ★ ยกแพตเทิร์นจาก dbo.install_checklists ของระบบขาย: 1 แถวต่อ 1 งาน เก็บผลตรวจเป็น JSON
--   แทนแผนเดิมที่จะสร้าง 4 ตาราง (checklist / measure / photos / signoff)
-- หัวข้อในนี้ยกมาจากใบจริง เล่มที่ 049 เลขที่ 2429: คุณภาพงาน 7 ข้อ · การทดสอบระบบ 7 ค่า
IF OBJECT_ID('dbo.om_job_report', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_job_report (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    booking_id    INT NOT NULL REFERENCES dbo.om_bookings(id),
    job_no        NVARCHAR(30) COLLATE Latin1_General_BIN2 NULL,  -- OM-6909-2841 ออกตอนเริ่มงาน
    paper_ref     NVARCHAR(30) NULL,        -- เล่ม/เลขที่ของกระดาษเดิม ช่วงเปลี่ยนผ่าน
    -- ผลตรวจ 3 ก้อน เก็บเป็น JSON (ค้นข้ามงานด้วย OPENJSON/JSON_VALUE ได้)
    checks        NVARCHAR(MAX) NULL,       -- {"panel":{"pass":1},"clamp":{"pass":0,"fix":"แคลมป์หลวม"}}
    measures      NVARCHAR(MAX) NULL,       -- {"v_dc":279,"i_dc":2.53,"pin":0.671,...}
    photos        NVARCHAR(MAX) NULL,       -- [{"kind":"before","path":"..."},{"kind":"after",...}]
    note          NVARCHAR(MAX) NULL,       -- รายละเอียดอื่น ๆ
    result        NVARCHAR(10) COLLATE Latin1_General_BIN2 NULL,  -- pass | fail
    fail_count    INT NOT NULL DEFAULT 0,   -- สรุปไว้ให้กรองเร็ว ไม่ต้องแกะ JSON
    started_at    DATETIMEOFFSET NULL,
    finished_at   DATETIMEOFFSET NULL,
    -- ลายเซ็น 3 ฝ่าย (Q.C. ยังไม่บังคับ — ผู้ใช้สั่งเก็บช่องไว้ก่อน 10 ก.ย.)
    tech_user_id  INT NULL,
    tech_sign     NVARCHAR(MAX) NULL,
    cust_sign     NVARCHAR(MAX) NULL,
    cust_name     NVARCHAR(120) NULL,
    qc_user_id    INT NULL,
    qc_sign       NVARCHAR(MAX) NULL,
    qc_at         DATETIMEOFFSET NULL,
    -- ปิดงานด้วยวิธีไหน + หลักฐาน
    close_method  NVARCHAR(20) COLLATE Latin1_General_BIN2 NULL,  -- onsite_sign | line_otp | tech_proxy
    proxy_reason  NVARCHAR(200) NULL,
    otp_request_id INT NULL REFERENCES dbo.om_otp_requests(id),
    lat           DECIMAL(9,6) NULL,
    lng           DECIMAL(9,6) NULL,
    gps_accuracy  INT NULL,
    ip            NVARCHAR(45) NULL,
    device        NVARCHAR(200) NULL,
    evidence_hash NVARCHAR(80) COLLATE Latin1_General_BIN2 NULL,
    created_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_om_job_report_booking UNIQUE (booking_id),
    CONSTRAINT CK_om_job_report_json CHECK (
      (checks   IS NULL OR ISJSON(checks)   = 1) AND
      (measures IS NULL OR ISJSON(measures) = 1) AND
      (photos   IS NULL OR ISJSON(photos)   = 1))
  );
  CREATE INDEX IX_om_job_report_result ON dbo.om_job_report (result, finished_at);
END
GO

-- ★ CK_om_settings_json เดิมรับแค่ JSON object/array, true/false, ตัวเลข
--   ค่าที่เป็นข้อความ (เช่น ช่วงเวลาโทร) ใส่ไม่ได้เลย เพราะ ISJSON('"x"') = 0 ใน MSSQL
--   ⇒ ขยายให้รับ JSON string ด้วย (ขึ้นต้นและลงท้ายด้วยเครื่องหมายคำพูด)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_om_settings_json')
  ALTER TABLE dbo.om_settings DROP CONSTRAINT CK_om_settings_json;
GO
ALTER TABLE dbo.om_settings ADD CONSTRAINT CK_om_settings_json CHECK (
  value_json IS NULL OR ISJSON(value_json) = 1
  OR value_json IN ('true','false') OR TRY_CAST(value_json AS FLOAT) IS NOT NULL
  OR (LEFT(value_json, 1) = '"' AND RIGHT(value_json, 1) = '"'));
GO

-- กติกาการโทร — ค่าตั้งต้นที่ผมใส่ไว้ใน mockup รอผู้ใช้เคาะตัวเลขจริง (ยังตอบไม่ครบ)
MERGE INTO dbo.om_settings AS t
USING (VALUES
  ('call.retry_days',     '3',              N'ไม่รับสาย เว้นกี่วันถึงโทรใหม่',      'call', 10, 1),
  ('call.max_attempts',   '3',              N'ไม่รับสายกี่ครั้งถึงย้ายไปติดต่อไม่ได้', 'call', 20, 1),
  ('call.postpone_days',  '30',             N'ลูกค้าขอเลื่อน เว้นกี่วัน',            'call', 30, 1),
  ('call.hours',          '"09:00-18:00"',  N'ช่วงเวลาที่อนุญาตให้โทร',              'call', 40, 1),
  ('job.otp_channel',     '"line_then_sms"', N'ส่ง OTP ปิดงานทางไหน',              'job',  10, 1),
  ('job.autoclose_hours', '24',             N'ลูกค้าไม่ยืนยันกี่ชั่วโมงถึงปิดเอง',    'job',  20, 1),
  ('job.qc_required',     'false',          N'ต้องมีลายเซ็น Q.C. ก่อนปิดงานไหม',    'job',  30, 1)
) AS s([key], value_json, label_th, group_key, sort_order, pending_biz)
ON t.[key] = s.[key] COLLATE Latin1_General_BIN2
WHEN NOT MATCHED THEN INSERT ([key], value_json, label_th, group_key, sort_order, pending_biz)
  VALUES (s.[key], s.value_json, s.label_th, s.group_key, s.sort_order, s.pending_biz);
GO
