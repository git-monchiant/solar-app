-- เลข PO หลายใบต่อระบบติดตั้ง (ผู้ใช้เคาะ 9 ก.ย. 69 "เก็บหลายใบ")
-- เดิม om_installations.po_number เก็บได้ใบเดียว ⇒ บ้านที่มีทั้ง PO ตอนติดตั้งและ PO งานบริการรายงวด
-- จะทับกัน · ตารางนี้เก็บครบทุกใบ พร้อมบอกว่าเป็นใบประเภทไหนและมาจากแถวไหนของไฟล์ต้นทาง
-- om_installations.po_number ยังอยู่เหมือนเดิม = ใบของ "งานติดตั้ง" ไว้ให้หน้าจอเดิมใช้ได้ต่อ
IF OBJECT_ID('om_installation_pos','U') IS NULL
BEGIN
  CREATE TABLE om_installation_pos (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    house_id        INT NOT NULL,
    installation_id INT NOT NULL,
    po_number       NVARCHAR(80) COLLATE Latin1_General_BIN2 NOT NULL,  -- รหัสเอกสาร ต้องไม่สนตัวพิมพ์ผิด
    po_date         DATE NULL,                 -- วันที่ในใบแจ้งหนี้ที่อ้างถึง PO ใบนี้
    kind            VARCHAR(12) COLLATE Latin1_General_BIN2 NOT NULL,   -- install | service | other
    note            NVARCHAR(300) NULL,        -- คำอธิบายรายการจากไฟล์ต้นทาง
    amount_kw       DECIMAL(10,4) NULL,        -- ขนาด kW ที่ระบุในบรรทัดนั้น (ถ้ามี)
    source_ref      NVARCHAR(200) NULL,        -- อ้างจุดในต้นทาง เช่น 'AR-SSE แถว 2613'
    batch_id        INT NULL,                  -- อ้าง om_import_batches
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_installation_pos_at DEFAULT SYSDATETIMEOFFSET()
  );
  -- กันใบซ้ำ: PO ใบเดียวกัน วันเดียวกัน ของ installation เดียวกัน ให้มีได้แถวเดียว
  CREATE UNIQUE INDEX UX_om_installation_pos ON om_installation_pos (installation_id, po_number, po_date);
  CREATE INDEX IX_om_installation_pos_house ON om_installation_pos (house_id);
  CREATE INDEX IX_om_installation_pos_po ON om_installation_pos (po_number);
END
GO
