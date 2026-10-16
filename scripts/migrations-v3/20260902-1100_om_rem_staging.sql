-- ทะเบียน REM ฝั่งเรา (staging) — สำเนาของ master/units + saleorder/transfer
-- ทำไมต้องมี: พิสูจน์แล้ว 2 ก.ย. ว่า dbo.projects ของระบบขายไม่ครอบคลุมงาน O&M
--   (382 หลังใน 50 โครงการไม่มีคู่ฝั่งขายเลย · ตัวใหญ่สุด K9BK1 217 หลัง)
--   ⇒ ทะเบียน REM เป็นตัวหลัก · ระบบขายเป็นทางเข้าเพิ่ม
-- ★ ห้ามเขียนทับข้อมูลจริง (om_houses/om_installations) จากตารางนี้ตรง ๆ
--   ตารางนี้เป็น "ของที่ REM ส่งมา" ล้วน ๆ ใช้เทียบ/ตรวจก่อนค่อยตัดสิน
-- ★ collation: คอลัมน์รหัสใช้ Latin1_General_BIN2 (Thai_CI_AS ไม่สนตัวพิมพ์ → 'k9' = 'K9' พังเงียบ)
--   ยกเว้น project_id ต้องเป็น Thai_CI_AS เพราะต้อง JOIN กับ om_projects.project_id

-- ─────────── unit ทั้งหมด (ขายแล้วหรือยังไม่ขายก็เก็บ) ───────────
IF OBJECT_ID('dbo.om_rem_units') IS NULL
CREATE TABLE dbo.om_rem_units (
  unit_id          NVARCHAR(60)  COLLATE Latin1_General_BIN2 NOT NULL CONSTRAINT PK_om_rem_units PRIMARY KEY,
  project_id       NVARCHAR(20)  NOT NULL,          -- Thai_CI_AS — join กับ om_projects
  project_name     NVARCHAR(200) NULL,
  project_type     NVARCHAR(4)   NULL,              -- H = บ้าน · C = คอนโด
  unit_number      NVARCHAR(60)  COLLATE Latin1_General_BIN2 NULL,
  house_number     NVARCHAR(100) NULL,              -- ตามที่ REM ส่งมา (มีเว้นวรรคปนบ้าง เช่น '177 / 255')
  house_number_key NVARCHAR(100) COLLATE Latin1_General_BIN2 NULL,  -- ตัดเว้นวรรค/ศูนย์นำหน้า — ตัวที่ใช้ค้นจริง
  phase_name       NVARCHAR(100) NULL,
  model_name       NVARCHAR(200) NULL,
  model_type_name  NVARCHAR(100) NULL,
  titledeed_area   DECIMAL(12,2) NULL,
  raw              NVARCHAR(MAX) NULL CONSTRAINT CK_om_rem_units_raw CHECK (raw IS NULL OR ISJSON(raw)=1),
  synced_at        DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_rem_units_at DEFAULT SYSDATETIMEOFFSET()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_units_pj_hn')
CREATE INDEX IX_om_rem_units_pj_hn ON dbo.om_rem_units(project_id, house_number_key) INCLUDE (unit_id, unit_number);
GO

-- ─────────── สัญญาโอน (บ้านที่ขายและโอนแล้ว) ───────────
IF OBJECT_ID('dbo.om_rem_transfers') IS NULL
CREATE TABLE dbo.om_rem_transfers (
  contract_id      NVARCHAR(80)  COLLATE Latin1_General_BIN2 NOT NULL CONSTRAINT PK_om_rem_transfers PRIMARY KEY,
  project_id       NVARCHAR(20)  NOT NULL,
  project_name     NVARCHAR(200) NULL,
  project_type     NVARCHAR(4)   NULL,
  unit_id          NVARCHAR(60)  COLLATE Latin1_General_BIN2 NULL,
  unit_number      NVARCHAR(60)  COLLATE Latin1_General_BIN2 NULL,
  house_number     NVARCHAR(100) NULL,
  house_number_key NVARCHAR(100) COLLATE Latin1_General_BIN2 NULL,
  -- ★ DATETIMEOFFSET ไม่ใช่ DATETIME2 — เวลาไทย +07:00 เป็นกติกาของโปรเจกต์
  transfer_date    DATETIMEOFFSET NULL,
  condo_register_date DATETIMEOFFSET NULL,
  latitude         NVARCHAR(40)  NULL,
  longitude        NVARCHAR(40)  NULL,
  raw              NVARCHAR(MAX) NULL CONSTRAINT CK_om_rem_transfers_raw CHECK (raw IS NULL OR ISJSON(raw)=1),
  synced_at        DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_rem_tr_at DEFAULT SYSDATETIMEOFFSET()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_tr_pj_hn')
CREATE INDEX IX_om_rem_tr_pj_hn ON dbo.om_rem_transfers(project_id, house_number_key) INCLUDE (contract_id, unit_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_tr_unit')
CREATE INDEX IX_om_rem_tr_unit ON dbo.om_rem_transfers(unit_id);
GO

-- ─────────── เจ้าของตามสัญญา ───────────
-- ★ มี citizen_id ของจริง — ระดับเดียวกับ om_customers.id_card และ leads.id_card_number ที่มีอยู่แล้ว
--   ใช้เป็นกุญแจจับคู่ที่แม่นที่สุด · ห้ามส่งออกนอกระบบ · ห้าม echo ลง log
IF OBJECT_ID('dbo.om_rem_owners') IS NULL
CREATE TABLE dbo.om_rem_owners (
  id               INT IDENTITY(1,1) CONSTRAINT PK_om_rem_owners PRIMARY KEY,
  contract_id      NVARCHAR(80)  COLLATE Latin1_General_BIN2 NOT NULL,
  customer_item_id NVARCHAR(60)  COLLATE Latin1_General_BIN2 NULL,
  first_name       NVARCHAR(200) NULL,
  last_name        NVARCHAR(200) NULL,
  is_main          BIT           NOT NULL CONSTRAINT DF_om_rem_own_main DEFAULT 0,
  citizen_id       NVARCHAR(20)  COLLATE Latin1_General_BIN2 NULL,
  passport_id      NVARCHAR(40)  COLLATE Latin1_General_BIN2 NULL,
  -- ★ REM ยัดหลายเบอร์มาในช่องเดียวคั่นด้วย , ได้ (เจอ 2 ราย ยาว 32 ตัว) — เผื่อความยาวไว้
  phone            NVARCHAR(120) COLLATE Latin1_General_BIN2 NULL,   -- ตามที่ REM ส่ง (มักไม่มี 0 นำหน้า)
  phone_key        NVARCHAR(20)  COLLATE Latin1_General_BIN2 NULL,   -- เติม 0 / ตัด 66 แล้ว — ตัวที่ใช้ค้น
  email            NVARCHAR(200) NULL,
  nationality_name NVARCHAR(100) NULL,
  synced_at        DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_rem_own_at DEFAULT SYSDATETIMEOFFSET()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_own_contract')
CREATE INDEX IX_om_rem_own_contract ON dbo.om_rem_owners(contract_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_own_cid')
CREATE INDEX IX_om_rem_own_cid ON dbo.om_rem_owners(citizen_id) WHERE citizen_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_own_phone')
CREATE INDEX IX_om_rem_own_phone ON dbo.om_rem_owners(phone_key) WHERE phone_key IS NOT NULL;
GO

-- ─────────── บันทึกการ sync ───────────
IF OBJECT_ID('dbo.om_sync_log') IS NULL
CREATE TABLE dbo.om_sync_log (
  id            INT IDENTITY(1,1) CONSTRAINT PK_om_sync_log PRIMARY KEY,
  kind          NVARCHAR(30)  NOT NULL,      -- rem_units | rem_transfers | sales_sweep
  scope         NVARCHAR(100) NULL,          -- รหัสโครงการ หรือ 'all'
  status        NVARCHAR(20)  NOT NULL,      -- running | ok | error
  started_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_sync_log_st DEFAULT SYSDATETIMEOFFSET(),
  finished_at   DATETIMEOFFSET NULL,
  n_fetched     INT NOT NULL CONSTRAINT DF_om_sync_log_f DEFAULT 0,
  n_inserted    INT NOT NULL CONSTRAINT DF_om_sync_log_i DEFAULT 0,
  n_updated     INT NOT NULL CONSTRAINT DF_om_sync_log_u DEFAULT 0,
  n_skipped     INT NOT NULL CONSTRAINT DF_om_sync_log_s DEFAULT 0,
  message       NVARCHAR(1000) NULL,
  actor_user_id INT NULL,
  CONSTRAINT CK_om_sync_log_status CHECK (status IN ('running','ok','error'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_sync_log_kind')
CREATE INDEX IX_om_sync_log_kind ON dbo.om_sync_log(kind, started_at DESC);
GO

-- ─────────── คิวรอจับคู่ (ที่ sweep ไม่มั่นใจ) ───────────
-- ★ กติกา: ไม่มั่นใจ = ไม่แตะข้อมูลจริง แต่ต้องไม่หายเงียบ — มากองรอให้คนตัดสิน
IF OBJECT_ID('dbo.om_match_queue') IS NULL
CREATE TABLE dbo.om_match_queue (
  id            INT IDENTITY(1,1) CONSTRAINT PK_om_match_queue PRIMARY KEY,
  lead_id       INT           NOT NULL,
  tier          NVARCHAR(12)  NOT NULL,   -- confident | likely | unknown
  status        NVARCHAR(12)  NOT NULL CONSTRAINT DF_om_mq_st DEFAULT 'pending',  -- pending|accepted|rejected|auto
  reason        NVARCHAR(300) NULL,       -- ทำไมถึงไม่มั่นใจ
  cand_contract NVARCHAR(80)  COLLATE Latin1_General_BIN2 NULL,   -- ผู้สมัครที่ดีที่สุด
  cand_project  NVARCHAR(20)  NULL,
  cand_house    NVARCHAR(100) NULL,
  candidates    NVARCHAR(MAX) NULL CONSTRAINT CK_om_mq_cand CHECK (candidates IS NULL OR ISJSON(candidates)=1),
  house_id      INT NULL,                 -- เติมเมื่อรับแล้ว
  decided_by    INT NULL,
  decided_at    DATETIMEOFFSET NULL,
  created_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_mq_at DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT CK_om_mq_tier CHECK (tier IN ('confident','likely','unknown')),
  CONSTRAINT CK_om_mq_status CHECK (status IN ('pending','accepted','rejected','auto'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_om_match_queue_lead')
CREATE UNIQUE INDEX UX_om_match_queue_lead ON dbo.om_match_queue(lead_id);
GO

-- เผื่อฐานที่สร้างตารางไปก่อนแล้ว (phone เดิม 30 ตัวสั้นไป)
IF COL_LENGTH('dbo.om_rem_owners','phone') IS NOT NULL AND COL_LENGTH('dbo.om_rem_owners','phone') < 240
  ALTER TABLE dbo.om_rem_owners ALTER COLUMN phone NVARCHAR(120) COLLATE Latin1_General_BIN2 NULL;
GO
