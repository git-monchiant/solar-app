-- O&M: เมนูลูกค้า CRUD + ทางเข้าลูกค้าซื้อใหม่จากระบบขาย
-- ตามแผน docs/plans/20260901_01 · ผู้ใช้เคาะครบ 1 ก.ย.

-- 1) soft delete ลูกค้า (ลบจริงได้เฉพาะไม่มีประวัติผูก)
IF COL_LENGTH('om_customers', 'is_active') IS NULL
  ALTER TABLE om_customers ADD is_active BIT NOT NULL CONSTRAINT DF_om_customers_active DEFAULT 1;
GO

-- 2) ที่มาจากระบบขาย — กัน sync ซ้ำ + ตามย้อนได้ว่ามาจาก lead ไหน
IF COL_LENGTH('om_houses', 'lead_id') IS NULL
  ALTER TABLE om_houses ADD lead_id INT NULL;
GO
IF COL_LENGTH('om_installations', 'lead_id') IS NULL
  ALTER TABLE om_installations ADD
    lead_id          INT NULL,
    warranty_doc_no  NVARCHAR(40) NULL,     -- เลขที่ใบรับประกัน SSE-xxx
    inverter_kw      DECIMAL(6,2) NULL,     -- ขนาด inverter จากใบประกัน (แยกจาก rem_size_kwp ที่มาจาก REM)
    battery_brand    NVARCHAR(60) NULL,
    battery_kwh      DECIMAL(6,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_installations_lead')
  CREATE INDEX IX_om_installations_lead ON om_installations(lead_id) WHERE lead_id IS NOT NULL;
GO

-- 3) log การแก้ลูกค้า (แนวเดียวกับ om_booking_history)
IF OBJECT_ID('om_customer_history') IS NULL
CREATE TABLE om_customer_history (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  customer_id   INT NOT NULL,
  [action]      VARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL,
  -- create update soft_delete restore hard_delete merge link_house unlink_house phone_add phone_del lead_sync
  actor_user_id INT NULL,
  from_json     NVARCHAR(MAX) NULL,
  to_json       NVARCHAR(MAX) NULL,
  reason        NVARCHAR(300) NULL,
  created_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT CK_om_ch_from CHECK (from_json IS NULL OR ISJSON(from_json) = 1),
  CONSTRAINT CK_om_ch_to   CHECK (to_json   IS NULL OR ISJSON(to_json)   = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_ch_customer')
  CREATE INDEX IX_om_ch_customer ON om_customer_history(customer_id, created_at DESC);
GO
