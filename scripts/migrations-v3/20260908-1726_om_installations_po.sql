-- O&M: เพิ่มคอลัมน์เก็บเลข PO (ใบสั่งซื้อ) ไว้กับ installation
-- ที่มา: ชีต "สรุป บ้านเสนาติดตั้ง solar ส่งพี่เปิ้ล 20260908.xlsx" มีคอลัมน์ PO ต่อรายการใบแจ้งหนี้
-- แต่ om_houses / om_installations ยังไม่มีที่เก็บ (ตรวจซ้ำจาก information_schema แล้ว ไม่มีคอลัมน์ po* ในทั้งสองตาราง)
-- แผน/รายงานประกอบ: docs/20260908_08_เทียบชีตส่งพี่เปิ้ล-กับระบบ-วันติดตั้ง-PO-KW.md
--
-- ★ กติกาโปรเจกต์: DATETIMEOFFSET (ไม่ใช้ DATETIME2) · คอลัมน์รหัสใส่ COLLATE Latin1_General_BIN2
--   (Thai_CI_AS ไม่สนตัวพิมพ์) · ไม่ใช้ MERGE · ห้ามลบ/เปลี่ยนชนิดคอลัมน์เดิม
-- ★ ห้ามรัน migration นี้เอง — เตรียมไว้ให้ผู้ใช้/ผู้ควบคุมเป็นคนรัน

IF COL_LENGTH('om_installations', 'po_number') IS NULL
  ALTER TABLE om_installations ADD
    po_number NVARCHAR(50) COLLATE Latin1_General_BIN2 NULL,  -- เลข PO จากชีต (เช่น POHOPOD16040005, PO33030050)
    po_date   DATE NULL;                                       -- วันที่ใน PO ถ้ามี (ชีตนี้ไม่มีคอลัมน์วันที่ PO แยก จึงมักเป็น NULL)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_installations_po_number')
  CREATE INDEX IX_om_installations_po_number ON om_installations(po_number) WHERE po_number IS NOT NULL;
GO
