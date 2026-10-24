-- ═══════════════════════════════════════════════════════════════════════════
-- O&M Module — core schema (v3)
-- ออกแบบ: docs/plans/20260819_01 (โมดูล) · 20260820_01 (data-migration) · 20260820_02 (สิทธิ์)
--
-- หลักการ:
--   • ตารางของ O&M ใช้ prefix om_ ใน schema dbo (ผู้ใช้ตัดสิน 19 ส.ค.) — ห้ามแตะตาราง dbo อื่น
--   • เวลาใช้ DATETIMEOFFSET (+07:00) เสมอ — ห้าม DATETIME2 (กติกาโปรเจกต์)
--   • token/รหัส/hash ใส่ COLLATE Latin1_General_BIN2 (กัน Thai_CI_AS ไม่สนตัวพิมพ์)
--   • COLLATE ต้องอยู่หลัง type ก่อน NULL/DEFAULT
--   • สิทธิ์ล้างแผง = ledger append-only (grants/redemptions) ยอดคงเหลือคำนวณสด
--   • idempotent: รันซ้ำได้ (IF OBJECT_ID ... IS NULL)
--   • ทุกแถว import ตั้ง source_batch_id (ถอนคืนได้) · NULL = คนสร้างเอง ห้ามลบ
-- ═══════════════════════════════════════════════════════════════════════════

-- ── batch bookkeeping: ถอนการนำเข้าคืนได้ ──────────────────────────────────
IF OBJECT_ID('dbo.om_import_batches', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_import_batches (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    source_file  NVARCHAR(300) NOT NULL,           -- ชื่อไฟล์ Excel ต้นทาง
    note         NVARCHAR(500) NULL,
    row_count    INT NOT NULL DEFAULT 0,
    created_by   INT NULL,                          -- users.id (NULL = ระบบ)
    created_at   DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
END
GO

-- ── lookup: ชนิดงานบริการ (data-driven — เพิ่มชนิดที่ DB ไม่แก้โค้ด) ─────────
IF OBJECT_ID('dbo.om_service_type', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_service_type (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    code           NVARCHAR(30) COLLATE Latin1_General_BIN2 NOT NULL,  -- 'cleaning','repair','inspect'
    label_th       NVARCHAR(100) NOT NULL,
    consumes_quota BIT NOT NULL DEFAULT 0,           -- 1 = กินสิทธิ์ล้างแผง (เฉพาะ cleaning)
    active         BIT NOT NULL DEFAULT 1,
    sort_order     INT NOT NULL DEFAULT 100,
    CONSTRAINT UQ_om_service_type_code UNIQUE (code)
  );
END
GO

MERGE dbo.om_service_type AS t
USING (VALUES
  (N'cleaning', N'ล้างแผง',        1, 10),
  (N'repair',   N'ซ่อม',           0, 20),
  (N'inspect',  N'ตรวจเช็กประจำปี', 0, 30),
  (N'install',  N'ติดตั้งเพิ่ม',    0, 40),
  (N'other',    N'อื่น ๆ',          0, 90)
) AS s(code, label_th, consumes_quota, sort_order)
ON t.code = s.code
WHEN MATCHED THEN UPDATE SET label_th = s.label_th, consumes_quota = s.consumes_quota, sort_order = s.sort_order
WHEN NOT MATCHED THEN INSERT (code, label_th, consumes_quota, sort_order)
  VALUES (s.code, s.label_th, s.consumes_quota, s.sort_order);
GO

-- ── om_houses: ทะเบียนบ้าน/ลูกค้า O&M (master · 1 แถว = 1 O&M entity) ────────
-- segment: house=รายหลัง · condo=รวบรายโครงการ · facility=รายบัญชีส่วนกลาง
-- เก็บทั้ง 4,725 (ผู้ใช้สั่ง: เก็บทุก segment) · O&M ล้างแผงกรอง segment='house'
IF OBJECT_ID('dbo.om_houses', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_houses (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    segment        NVARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,  -- 'house'|'condo'|'facility'

    -- ตัวตน
    full_name      NVARCHAR(200) NULL,
    house_number   NVARCHAR(50)  NULL,
    address        NVARCHAR(500) NULL,

    -- โครงการ (normalize แล้ว — ดู om map โครงการ)
    project_code   NVARCHAR(50)  COLLATE Latin1_General_BIN2 NULL,     -- branchid ต้นทาง
    project_name   NVARCHAR(200) NULL,
    building_id    NVARCHAR(50)  COLLATE Latin1_General_BIN2 NULL,     -- unit id ต้นทาง (house)
    home_type      NVARCHAR(60)  NULL,                                 -- บ้านเดี่ยว/ทาวน์/คอนโด/shophouse

    -- customer id อ้างกลับระบบมอนิเตอร์ (ผู้ใช้สั่งเก็บ)
    src_unit_id         NVARCHAR(50)  COLLATE Latin1_General_BIN2 NULL,  -- product_update.id
    src_acc_id          NVARCHAR(50)  COLLATE Latin1_General_BIN2 NULL,  -- acc_id
    src_customer_id_enc NVARCHAR(200) COLLATE Latin1_General_BIN2 NULL,  -- customer_id_enc

    -- package ที่ขาย (ผู้ใช้สั่งเก็บ)
    package_id     NVARCHAR(50)  COLLATE Latin1_General_BIN2 NULL,
    package_name   NVARCHAR(200) NULL,
    product_type   NVARCHAR(20)  COLLATE Latin1_General_BIN2 NULL,     -- myHome | facility

    -- สถานะ O&M
    has_solar      BIT NOT NULL DEFAULT 0,                             -- true = ลูกค้า O&M · false = prospect backlog
    line_user_id   INT NULL,                                          -- FK dbo.line_users (ผูก LINE ทีหลัง)

    -- meta
    src_created_at DATETIMEOFFSET NULL,
    src_updated_at DATETIMEOFFSET NULL,
    src_platform_flags NVARCHAR(200) NULL,                            -- from_v1/v2 is_v1/v2 (json)
    enabled        BIT NOT NULL DEFAULT 1,
    note           NVARCHAR(MAX) NULL,

    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id),
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_houses_segment_solar ON dbo.om_houses (segment, has_solar);
  CREATE INDEX IX_om_houses_project ON dbo.om_houses (project_code);
  CREATE INDEX IX_om_houses_line_user ON dbo.om_houses (line_user_id);
END
GO

-- ── om_installations: ระบบโซลาร์ที่ติดตั้ง (1 หลังมีได้หลายระบบ/เพิ่มแผง) ────
-- warranty_start = MAX(install_date, transfer_date) — โอน/ติดตั้งอันไหนหลังสุด
IF OBJECT_ID('dbo.om_installations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_installations (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    house_id       INT NOT NULL REFERENCES dbo.om_houses(id),

    inverter_brand NVARCHAR(100) NULL,                                -- brand (ABB/HUAWEI/SMA)
    inverter_sn    NVARCHAR(200) COLLATE Latin1_General_BIN2 NULL,    -- refid = id ของ inverter
    huawei_dev_type NVARCHAR(50) NULL,
    huawei_dev_ids NVARCHAR(MAX) NULL,

    install_date   DATE NULL,
    transfer_date  DATE NULL,
    warranty_start AS (
      CASE
        WHEN install_date IS NULL AND transfer_date IS NULL THEN NULL
        WHEN install_date IS NULL THEN transfer_date
        WHEN transfer_date IS NULL THEN install_date
        WHEN install_date >= transfer_date THEN install_date
        ELSE transfer_date
      END
    ) PERSISTED,                                                     -- ★ MAX(install,transfer) คำนวณอัตโนมัติ
    warranty_date_missing AS (CASE WHEN install_date IS NULL AND transfer_date IS NULL THEN 1 ELSE 0 END) PERSISTED,

    monitor_expired_date DATETIMEOFFSET NULL,                        -- expired_date = หมด subscription (คนละตัวกับประกัน)

    note           NVARCHAR(MAX) NULL,
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id),
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_installations_house ON dbo.om_installations (house_id);
END
GO

-- ── om_entitlement_grants: สิทธิ์ล้างแผงที่ได้ (append-only ledger) ──────────
-- ยกยอด: contract_base valid_to=NULL (ไม่หมดอายุ) · promo ตั้ง valid_to ได้
IF OBJECT_ID('dbo.om_entitlement_grants', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_entitlement_grants (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    installation_id INT NOT NULL REFERENCES dbo.om_installations(id), -- สิทธิ์ผูกกับระบบที่ติดตั้ง (ขายบ้านต่อ สิทธิ์ไปกับบ้าน)
    qty            INT NOT NULL,                                      -- +4/+8/+1 · ติดลบได้ (ปรับแก้)
    source         NVARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL, -- contract_base|purchase|promo|manual_adjust|import
    reason         NVARCHAR(300) NULL,
    contract_term  NVARCHAR(20)  NULL,                                -- '2ปี4ครั้ง' — อ้างอิงแสดงสถานะสัญญา ไม่ตัดสิทธิ์
    valid_from     DATE NULL,
    valid_to       DATE NULL,                                         -- contract_base=NULL(ยกยอด) · promo ตั้งได้
    created_by     INT NULL,                                          -- users.id · NULL = seed อัตโนมัติ
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id)
  );
  CREATE INDEX IX_om_grants_installation ON dbo.om_entitlement_grants (installation_id);
END
GO

-- ── om_bookings: นัดหมายงานบริการ (1 นัด = 1 หลัง) ──────────────────────────
IF OBJECT_ID('dbo.om_bookings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_bookings (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    house_id       INT NOT NULL REFERENCES dbo.om_houses(id),
    service_type_id INT NOT NULL REFERENCES dbo.om_service_type(id),
    scheduled_at   DATETIMEOFFSET NULL,                              -- +07:00 เสมอ
    status         NVARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL DEFAULT N'NEW',
                                                                     -- NEW|CONFIRMED|IN_PROGRESS|DONE|NO_SHOW|CANCELLED
    note           NVARCHAR(MAX) NULL,
    created_by     INT NULL,
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id),
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_bookings_house ON dbo.om_bookings (house_id);
  CREATE INDEX IX_om_bookings_sched ON dbo.om_bookings (scheduled_at);
END
GO

-- ── om_redemptions: การใช้สิทธิ์ล้างแผง (append-only) ────────────────────────
IF OBJECT_ID('dbo.om_redemptions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_redemptions (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    installation_id INT NOT NULL REFERENCES dbo.om_installations(id),
    grant_id       INT NULL REFERENCES dbo.om_entitlement_grants(id), -- ตัดจาก grant ไหน (FIFO ตาม valid_to) หรือ NULL
    booking_id     INT NULL REFERENCES dbo.om_bookings(id),
    service_date   DATE NOT NULL,
    status         NVARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL DEFAULT N'used', -- used | void (คืนสิทธิ์)
    note           NVARCHAR(300) NULL,
    created_by     INT NULL,
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id)
  );
  CREATE INDEX IX_om_redemptions_installation ON dbo.om_redemptions (installation_id);
  CREATE INDEX IX_om_redemptions_grant ON dbo.om_redemptions (grant_id);
END
GO

-- ── view: ยอดสิทธิ์คงเหลือ (คำนวณสด — ตรรกะที่เดียว) ─────────────────────────
-- คงเหลือ = SUM(grants.qty) − COUNT(redemptions used) · ห้ามติดลบ (บังคับตอน insert redemption)
IF OBJECT_ID('dbo.om_entitlement_balance', 'V') IS NOT NULL
  DROP VIEW dbo.om_entitlement_balance;
GO
CREATE VIEW dbo.om_entitlement_balance AS
  SELECT
    i.id AS installation_id,
    i.house_id,
    ISNULL(g.granted, 0)  AS total_granted,
    ISNULL(r.used, 0)     AS total_used,
    ISNULL(g.granted, 0) - ISNULL(r.used, 0) AS balance
  FROM dbo.om_installations i
  LEFT JOIN (
    SELECT installation_id, SUM(qty) AS granted
    FROM dbo.om_entitlement_grants GROUP BY installation_id
  ) g ON g.installation_id = i.id
  LEFT JOIN (
    SELECT installation_id, COUNT(*) AS used
    FROM dbo.om_redemptions WHERE status = N'used' GROUP BY installation_id
  ) r ON r.installation_id = i.id;
GO
