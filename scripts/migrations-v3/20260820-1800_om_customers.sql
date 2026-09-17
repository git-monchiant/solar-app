-- ═══════════════════════════════════════════════════════════════════════════
-- O&M — แยก "คน (customer)" ออกจาก "บ้าน (house/asset)"
-- รองรับ: 1 บ้านหลายคน · 1 คนหลายบ้าน · เปลี่ยนเจ้าของตามเวลา
-- สิทธิ์ล้างแผงยังผูกที่ om_installations (= บ้าน) เหมือนเดิม — "สิทธิ์ไปกับบ้าน"
-- ═══════════════════════════════════════════════════════════════════════════

-- ── om_customers: คน (person) ──
IF OBJECT_ID('dbo.om_customers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_customers (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    full_name      NVARCHAR(200) NULL,
    id_card        NVARCHAR(20)  COLLATE Latin1_General_BIN2 NULL,   -- เลขบัตร (ถ้ามี) — ใช้ยืนยันคนเดียวกันข้ามบ้าน
    src_customer_id_enc NVARCHAR(200) COLLATE Latin1_General_BIN2 NULL, -- customer id ระบบเดิม
    note           NVARCHAR(MAX) NULL,
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id),
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_customers_name ON dbo.om_customers (full_name);
END
GO

-- ── om_customer_phones: 1 คนหลายเบอร์ ──
IF OBJECT_ID('dbo.om_customer_phones', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_customer_phones (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    customer_id    INT NOT NULL REFERENCES dbo.om_customers(id),
    phone          NVARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL,
    is_primary     BIT NOT NULL DEFAULT 1,
    source         NVARCHAR(20) NULL,                                -- 'bansena' | 'line_users' | 'manual'
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id),
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_customer_phones_cust ON dbo.om_customer_phones (customer_id);
  CREATE INDEX IX_om_customer_phones_phone ON dbo.om_customer_phones (phone);
END
GO

-- ── om_house_customers: ตัวเชื่อม บ้าน ↔ คน (many-to-many + ประวัติเจ้าของ) ──
IF OBJECT_ID('dbo.om_house_customers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_house_customers (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    house_id       INT NOT NULL REFERENCES dbo.om_houses(id),
    customer_id    INT NOT NULL REFERENCES dbo.om_customers(id),
    role           NVARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL DEFAULT N'owner', -- owner|resident|contact
    is_current     BIT NOT NULL DEFAULT 1,                           -- เจ้าของ/ผู้อยู่ปัจจุบัน
    valid_from     DATE NULL,
    valid_to       DATE NULL,                                        -- ปิดเมื่อเปลี่ยนเจ้าของ
    source         NVARCHAR(20) NULL,                                -- 'product_update' | 'bansena'
    note           NVARCHAR(300) NULL,
    source_batch_id INT NULL REFERENCES dbo.om_import_batches(id),
    created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_house_customers_house ON dbo.om_house_customers (house_id);
  CREATE INDEX IX_om_house_customers_cust ON dbo.om_house_customers (customer_id);
END
GO

-- om_houses.full_name/phone จากนี้เป็น "cache เจ้าของปัจจุบัน" (แหล่งจริง = om_customers)
-- ไม่ลบคอลัมน์ (กติกา v3 ห้ามลบ 3 เดือนแรก) — ใช้แสดงผลเร็ว ๆ
IF COL_LENGTH('dbo.om_houses', 'primary_customer_id') IS NULL
  ALTER TABLE dbo.om_houses ADD primary_customer_id INT NULL REFERENCES dbo.om_customers(id);
GO
