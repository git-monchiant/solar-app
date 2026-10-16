-- O&M: หลักฐานการดึงของแถมจาก REM + log การสแกน
-- ผู้ใช้สั่ง 8 ก.ย. 2569: "ต้องมีหลักฐานว่าดึงของแถมอะไรมาจาก REM"
-- แผน: docs/plans/20260908_02_สแกนของแถม-rem-ให้ครบ-พร้อมหลักฐาน.md
--
-- ★ กติกาโปรเจกต์: DATETIMEOFFSET (ไม่ใช่ DATETIME2) · คอลัมน์รหัสใส่ COLLATE Latin1_General_BIN2
--   (Thai_CI_AS ไม่สนตัวพิมพ์ 'v2' จะชนกับ 'V2') · ไม่ใช้ MERGE · ห้ามลบ/เปลี่ยนชนิดคอลัมน์เดิม

-- ═══ 1) หลักฐานรายแถวของแถม ═══
-- ★ เก็บ raw เฉพาะแถวที่ is_solar=1 (2,473 จาก 32,139 = ประหยัด 92%) — ผู้ใช้เคาะ 8 ก.ย.
IF COL_LENGTH('om_rem_promotions','raw') IS NULL
  ALTER TABLE om_rem_promotions ADD
    raw            NVARCHAR(MAX) NULL,   -- JSON ดิบที่ REM ส่งมาทั้งก้อน (เฉพาะแถวโซลาร์)
    parser_version VARCHAR(10) COLLATE Latin1_General_BIN2 NULL,  -- กติกาที่ใช้แยก v1|v2
    parsed_at      DATETIMEOFFSET NULL;
GO

-- ═══ 2) log การสแกน — ตอบได้ว่า "ของแถมหลังนี้มาจากการยิงครั้งไหน ด้วย body อะไร" ═══
IF OBJECT_ID('om_rem_scan_log') IS NULL
CREATE TABLE om_rem_scan_log (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  scan_kind     VARCHAR(12) COLLATE Latin1_General_BIN2 NOT NULL,  -- units|transfers|promos
  project_id    NVARCHAR(40) COLLATE Latin1_General_BIN2 NULL,
  contract_id   NVARCHAR(80) COLLATE Latin1_General_BIN2 NULL,
  unit_id       NVARCHAR(80) COLLATE Latin1_General_BIN2 NULL,
  request_body  NVARCHAR(400) NULL,       -- ★ body ที่ยิงไปจริง
  http_ok       BIT NULL,
  n_returned    INT NULL,
  n_promos      INT NULL,
  n_solar       INT NULL,
  n_om_years    INT NULL,
  error         NVARCHAR(400) NULL,
  started_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  finished_at   DATETIMEOFFSET NULL,
  actor         NVARCHAR(80) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_scan_log_proj')
  CREATE INDEX IX_om_rem_scan_log_proj ON om_rem_scan_log(project_id, started_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_scan_log_contract')
  CREATE INDEX IX_om_rem_scan_log_contract ON om_rem_scan_log(contract_id, started_at DESC);
GO
