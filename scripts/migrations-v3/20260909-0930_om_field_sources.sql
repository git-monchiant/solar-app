-- ที่มาข้อมูลรายฟิลด์ — บอกได้ว่า "ค่าไหน มาจากไฟล์ไหน แถวไหน เมื่อไหร่"
-- เดิมระบบผูกที่มาไว้ที่ระเบียนเดียว (om_installations.source_batch_id) จึงบอกได้แค่ว่า
-- "แถวนี้เกิดจาก import ไหน" แต่บอกไม่ได้ว่าวันติดตั้งมาจากชีตหนึ่ง ส่วน kW มาจากอีกชีตหนึ่ง
-- (ตัวอย่างที่พังจริง: batch 7 กับ 11 เติมค่าให้แถวเดิม ไม่มีใครอ้างถึงเลย ⇒ ไม่โผล่ในหน้าจอ)
IF OBJECT_ID('om_field_sources','U') IS NULL
BEGIN
  CREATE TABLE om_field_sources (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    house_id        INT NOT NULL,
    installation_id INT NULL,                    -- NULL = ฟิลด์อยู่ที่ระดับบ้าน
    table_name      VARCHAR(40)  COLLATE Latin1_General_BIN2 NOT NULL,  -- om_installations / om_houses
    column_name     VARCHAR(40)  COLLATE Latin1_General_BIN2 NOT NULL,  -- install_date / inverter_kw / po_number
    new_value       NVARCHAR(200) NULL,          -- ค่าที่เขียนลงไป (เก็บเป็นข้อความเพื่ออ่านง่าย)
    old_value       NVARCHAR(200) NULL,          -- ค่าเดิม (ปกติ NULL เพราะเราเติมเฉพาะช่องว่าง)
    source_kind     VARCHAR(20)  COLLATE Latin1_General_BIN2 NOT NULL,  -- import | rem | sales | manual
    batch_id        INT NULL,                    -- อ้าง om_import_batches
    source_ref      NVARCHAR(200) NULL,          -- อ้างจุดในต้นทาง เช่น 'AR-SSE แถว 2222 · แปลง 108'
    match_method    NVARCHAR(80) NULL,           -- วิธีจับคู่ เช่น 'รหัสโครงการใน DES + เลขแปลง'
    confidence      VARCHAR(12)  COLLATE Latin1_General_BIN2 NULL,      -- confirmed | probable
    actor_user_id   INT NULL,
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_field_sources_at DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_field_sources_house ON om_field_sources (house_id, created_at DESC);
  CREATE INDEX IX_om_field_sources_inst  ON om_field_sources (installation_id) WHERE installation_id IS NOT NULL;
  CREATE INDEX IX_om_field_sources_batch ON om_field_sources (batch_id) WHERE batch_id IS NOT NULL;
END
GO
