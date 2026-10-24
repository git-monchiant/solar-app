-- ใบตรวจรับงานแยกตามชนิดงาน — ย้ายนิยามหัวข้อออกจาก src/lib/om/job-form.ts มาอยู่ในฐาน
-- แผน: docs/plans/20260916_01_ใบตรวจรับงานแยกตามชนิดงาน-นิยามอยู่ในฐาน.md (ทาง ค-3)
--   นิยามหัวข้อ = ตาราง · คำตอบยังเป็น JSON ในใบงานแถวเดียวเหมือนเดิม (checks/measures/photos)
-- ★ code / section / kind ต้อง COLLATE Latin1_General_BIN2 — ฐานเป็น Thai_CI_AS ไม่สนตัวพิมพ์
--   ถ้าไม่ครอบ v_dc กับ V_DC จะกลายเป็นข้อเดียวกัน พังเงียบ ไม่มี error
-- ★ seed รอบนี้มีแต่ใบ install v1 — cleaning/repair/inspect/other ยังไม่รู้ว่ามีข้อไหนบ้าง
--   ระหว่างนี้ API fallback ไปใช้ใบ install ตัว active (ห้ามเดา seed เอง)

IF OBJECT_ID('dbo.om_job_form', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_job_form (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    service_type_id INT NOT NULL REFERENCES dbo.om_service_type(id),
    version         INT NOT NULL,                    -- 1, 2, 3 …
    label_th        NVARCHAR(120) NOT NULL,          -- "ใบตรวจรับงานติดตั้ง"
    is_active       BIT NOT NULL DEFAULT 1,          -- เวอร์ชันที่ใบงานใหม่จะหยิบไปใช้
    effective_from  DATETIMEOFFSET NULL,
    created_at      DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_om_job_form_version UNIQUE (service_type_id, version)
  );
  -- ★ ต่อชนิดงานมีใบ is_active = 1 ได้ใบเดียว
  CREATE UNIQUE INDEX UX_om_job_form_active
    ON dbo.om_job_form (service_type_id) WHERE is_active = 1;
END
GO

IF OBJECT_ID('dbo.om_job_form_item', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_job_form_item (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    form_id    INT NOT NULL REFERENCES dbo.om_job_form(id),
    code       NVARCHAR(40)  COLLATE Latin1_General_BIN2 NOT NULL,  -- ★ คีย์ที่ไปโผล่ใน JSON
    section    NVARCHAR(20)  COLLATE Latin1_General_BIN2 NOT NULL,  -- quality | measure | photo
    label_th   NVARCHAR(200) NOT NULL,
    kind       NVARCHAR(10)  COLLATE Latin1_General_BIN2 NOT NULL,  -- bool | num | text | photo
    unit       NVARCHAR(10) NULL,                                   -- V · A · kW
    required   BIT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL,
    is_active  BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_om_job_form_item_code UNIQUE (form_id, code),
    CONSTRAINT CK_om_job_form_item_kind CHECK (kind IN (N'bool', N'num', N'text', N'photo'))
  );
  CREATE INDEX IX_om_job_form_item_form ON dbo.om_job_form_item (form_id, sort_order);
END
GO

-- ใบงานจำว่าตอนกรอกใช้ใบเวอร์ชันไหน ⇒ ใบเก่าอ่านความหมายออกเสมอแม้หัวข้อจะถูกแก้ไปแล้ว
IF COL_LENGTH('dbo.om_job_report', 'form_id') IS NULL
  ALTER TABLE dbo.om_job_report ADD form_id INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_om_job_report_form')
  ALTER TABLE dbo.om_job_report ADD CONSTRAINT FK_om_job_report_form
    FOREIGN KEY (form_id) REFERENCES dbo.om_job_form(id);
GO

-- ── seed: ใบตรวจรับงานติดตั้ง v1 ──────────────────────────────────────────────
-- ยกจาก src/lib/om/job-form.ts ตรง ๆ (ใบกระดาษจริง เล่ม 049 เลขที่ 2429)
-- คุณภาพงาน 7 ข้อ + การทดสอบระบบ 7 ค่า · ★ ห้ามใช้ MERGE — IF NOT EXISTS แล้ว INSERT
DECLARE @install INT = (SELECT TOP 1 id FROM dbo.om_service_type WHERE code = N'install');
IF @install IS NULL THROW 50000, N'ไม่พบชนิดงาน install ใน om_service_type', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.om_job_form WHERE service_type_id = @install AND version = 1)
  INSERT INTO dbo.om_job_form (service_type_id, version, label_th, is_active, effective_from)
  VALUES (@install, 1, N'ใบตรวจรับงานติดตั้ง', 1, SYSDATETIMEOFFSET());

DECLARE @fid INT = (SELECT TOP 1 id FROM dbo.om_job_form
                     WHERE service_type_id = @install AND version = 1);

INSERT INTO dbo.om_job_form_item (form_id, code, section, label_th, kind, unit, required, sort_order)
SELECT @fid, s.code, s.section, s.label_th, s.kind, s.unit, 1, s.sort_order
FROM (VALUES
  -- คุณภาพงาน (bool — ติ๊กผ่าน/ไม่ผ่าน · ไม่ผ่านกรอกรายการที่ต้องแก้ไขได้)
  (N'panel',       N'quality', N'แผงโซลาร์เซลล์',                 N'bool', CAST(NULL AS NVARCHAR(10)),  10),
  (N'inverter',    N'quality', N'อินเวอร์เตอร์',                   N'bool', NULL,  20),
  (N'control_box', N'quality', N'ตู้คอนโทรล',                      N'bool', NULL,  30),
  (N'dc_breaker',  N'quality', N'DC Breaker',                      N'bool', NULL,  40),
  (N'ac_breaker',  N'quality', N'AC Breaker',                      N'bool', NULL,  50),
  (N'wireway',     N'quality', N'ราง Wire way',                    N'bool', NULL,  60),
  (N'wiring',      N'quality', N'การเดินสายไฟ และจุดต่อสายไฟ',      N'bool', NULL,  70),
  -- การทดสอบระบบ (num) — ★ กระดาษพิมพ์หน่วย (W) แต่ช่างเขียน kW ทุกใบ ⇒ ตรึงเป็น kW
  (N'v_dc',        N'measure', N'แรงดันไฟฟ้าฝั่ง DC',              N'num',  N'V',  80),
  (N'i_dc',        N'measure', N'กระแสไฟฟ้าฝั่ง DC',               N'num',  N'A',  90),
  (N'v_ac',        N'measure', N'แรงดันไฟฟ้าฝั่ง AC',              N'num',  N'V', 100),
  (N'i_ac',        N'measure', N'กระแสไฟฟ้าฝั่ง AC',               N'num',  N'A', 110),
  (N'pin',         N'measure', N'กำลังไฟฟ้าด้าน DC (Pin)',         N'num',  N'kW',120),
  (N'pout',        N'measure', N'กำลังไฟฟ้าด้าน AC (Pout)',        N'num',  N'kW',130),
  (N'ppk',         N'measure', N'ค่ากำลังการผลิตสูงสุด (Ppk)',      N'num',  N'kW',140)
) AS s(code, section, label_th, kind, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM dbo.om_job_form_item i
                   WHERE i.form_id = @fid
                     AND i.code = s.code COLLATE Latin1_General_BIN2);

-- ใบงานเดิม (ข้อมูลทดสอบ 1 แถว) ยังไม่มี form_id — ชี้ไปใบ install v1 ให้อ่านความหมายออก
UPDATE dbo.om_job_report SET form_id = @fid WHERE form_id IS NULL;
GO

-- ── view รายงานรายข้อ — แกะ JSON checks ออกมาเป็นแถวเทียบกับนิยามในตาราง ─────
--   SELECT label_th, COUNT(*) FROM v_om_job_check WHERE pass = 0 GROUP BY label_th
-- ★ ต่างจากแผน: แผนเขียน TRY_CAST(JSON_VALUE(...) AS BIT) แต่ JSON เก็บ true/false
--   ⇒ JSON_VALUE คืนสตริง 'true' และ TRY_CAST('true' AS BIT) = NULL (pass เป็น NULL ทุกแถว)
--   จึงใช้ CASE แปลงเอง รองรับทั้ง true/false และ 1/0
IF OBJECT_ID('dbo.v_om_job_check', 'V') IS NOT NULL DROP VIEW dbo.v_om_job_check;
GO
CREATE VIEW dbo.v_om_job_check AS
SELECT r.id AS report_id, r.booking_id, r.form_id, r.finished_at,
       i.code, i.label_th, i.section,
       CASE JSON_VALUE(j.value, '$.pass')
         WHEN 'true'  THEN CAST(1 AS BIT) WHEN 'false' THEN CAST(0 AS BIT)
         WHEN '1'     THEN CAST(1 AS BIT) WHEN '0'     THEN CAST(0 AS BIT)
         ELSE NULL END               AS pass,
       JSON_VALUE(j.value, '$.fix')  AS fix
FROM dbo.om_job_report r
CROSS APPLY OPENJSON(ISNULL(r.checks, N'{}')) j
JOIN dbo.om_job_form_item i ON i.form_id = r.form_id
                           AND i.code = j.[key] COLLATE Latin1_General_BIN2;
GO
