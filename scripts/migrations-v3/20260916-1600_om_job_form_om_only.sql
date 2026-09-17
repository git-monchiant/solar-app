-- ใบตรวจรับงาน = "ใบกลาง" ของงาน O&M ใบเดียว + ปิดชนิดงานติดตั้งเพิ่ม
-- ผู้ใช้เคาะ 16 ก.ย. 69: (1) ใบนี้ใช้กับงาน O&M อย่างเดียว (2) ปิด install ทิ้ง
--
-- ★ หลักฐานจากใบกระดาษจริง (เล่มที่ 049 เลขที่ 2429 · docs/Old Data/435039.jpg)
--   หัวใบเขียน "ใบตรวจรับงาน/ใบบริการ" ไม่ใช่ใบติดตั้ง — มีช่องติ๊ก [ ] ติดตั้ง  [/] O&M
--   ใบที่ได้มาติ๊ก O&M และช่องรายละเอียดเขียน "ทำล้างแผง เครื่องทำงานปกติ"
--   แต่กรอกการทดสอบระบบครบทุกค่า (DC 279V/2.53A · AC 233V/2.86A · Pin .671 · Pout .657 · Ppk 3.46)
--   ⇒ 14 ข้อชุดเดิมใช้กับงาน O&M ได้ทุกชนิด ไม่ต้องแยกใบต่อชนิดงาน
--
-- ⇒ service_type_id = NULL แปลว่า "ใบกลาง" ใช้กับทุกชนิดงานที่ยังไม่มีใบเฉพาะของตัวเอง
--   (วันหลังถ้าอยากได้ใบเฉพาะของล้างแผง ก็เพิ่มแถวที่ service_type_id = ล้างแผง ได้เลย ระบบหยิบใบเฉพาะก่อนเสมอ)

-- ═══ 1) ปลดของที่ล็อกคอลัมน์ก่อน แล้วค่อยเปลี่ยนให้เป็น NULL ได้ ═══
IF EXISTS (SELECT 1 FROM sys.indexes
           WHERE name = 'UX_om_job_form_active' AND object_id = OBJECT_ID('dbo.om_job_form'))
  DROP INDEX UX_om_job_form_active ON dbo.om_job_form;
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_om_job_form_version')
  ALTER TABLE dbo.om_job_form DROP CONSTRAINT UQ_om_job_form_version;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.om_job_form') AND name = 'service_type_id' AND is_nullable = 0)
  ALTER TABLE dbo.om_job_form ALTER COLUMN service_type_id INT NULL;
GO

-- คืน constraint/index กลับ
-- ★ MSSQL ถือว่า NULL เท่ากันใน UNIQUE ⇒ ใบกลางที่ is_active = 1 มีได้ใบเดียว (ตรงตามที่ต้องการ)
--   และยังเพิ่มใบเฉพาะของชนิดงานอื่นควบคู่ได้ เพราะ NULL กับ id เป็นคนละค่า
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_om_job_form_version')
  ALTER TABLE dbo.om_job_form ADD CONSTRAINT UQ_om_job_form_version UNIQUE (service_type_id, version);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_om_job_form_active' AND object_id = OBJECT_ID('dbo.om_job_form'))
  CREATE UNIQUE INDEX UX_om_job_form_active
    ON dbo.om_job_form (service_type_id) WHERE is_active = 1;
GO

-- ═══ 2) ใบที่ seed ไว้รอบก่อน (ผูกกับ install) → ใบกลาง + ชื่อตรงหัวกระดาษจริง ═══
UPDATE f
   SET f.service_type_id = NULL,
       f.label_th = N'ใบตรวจรับงาน / ใบบริการ'
  FROM dbo.om_job_form f
  JOIN dbo.om_service_type st ON st.id = f.service_type_id
 WHERE st.code = N'install';
GO

-- ═══ 3) ปิดชนิดงาน "ติดตั้งเพิ่ม" — O&M ไม่มีงานติดแผงใหม่ (ผู้ใช้ 16 ก.ย. 69) ═══
-- ซ่อนจากตัวเลือกตอนสร้างนัดเท่านั้น ไม่ลบข้อมูล เปิดคืนได้ด้วย active = 1
UPDATE dbo.om_service_type SET active = 0 WHERE code = N'install';
GO
