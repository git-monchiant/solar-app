-- Rich Menu + LIFF apps ของโมดูล O&M
-- ★ ข้อจำกัด LINE: rich menu แก้ไขหลังสร้างไม่ได้ + รูปอัปโหลดได้ครั้งเดียว
--   ⇒ ทุกการแก้ = สร้างเวอร์ชันใหม่แล้วสลับ (blue-green) · เวอร์ชันเก่าเก็บไว้ rollback (โควตา 1,000 เมนู/OA)
-- ★ แนวที่เคาะ: ไม่ตั้ง default rich menu ของ OA (ไม่แตะของทีมขาย)
--   เมนู O&M ผูกรายคน (link per-user) เฉพาะลูกค้าที่ยืนยันตัวตนแล้วเท่านั้น

CREATE TABLE dbo.om_richmenu_versions (
  id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_richmenu_versions PRIMARY KEY,
  version_no    INT           NOT NULL,
  name          NVARCHAR(120) NOT NULL,
  audience      NVARCHAR(20)  NOT NULL CONSTRAINT DF_om_rmv_aud DEFAULT 'verified',  -- verified (ลูกค้า O&M) / guest (เผื่ออนาคต)
  chat_bar_text NVARCHAR(14)  NOT NULL CONSTRAINT DF_om_rmv_bar DEFAULT N'เมนู',      -- LINE จำกัด 14 ตัวอักษร
  layout        NVARCHAR(MAX) NOT NULL,   -- JSON: {size, areas[{bounds, action}]}
  image_blob    VARBINARY(MAX) NULL,      -- รูปพื้นเมนู 2500x1686 (JPEG/PNG ≤1MB)
  image_mime    NVARCHAR(40)  NULL,
  rich_menu_id  NVARCHAR(60) COLLATE Latin1_General_BIN2 NULL,  -- id ที่ LINE คืนมาตอน create
  status        NVARCHAR(20)  NOT NULL CONSTRAINT DF_om_rmv_st DEFAULT 'draft',
                -- draft / publishing / active / history / failed
  note          NVARCHAR(400) NULL,
  created_by    INT NULL,
  created_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_rmv_created DEFAULT SYSDATETIMEOFFSET(),
  deployed_by   INT NULL,
  deployed_at   DATETIMEOFFSET NULL,
  CONSTRAINT CK_om_rmv_layout CHECK (ISJSON(layout) = 1),
  CONSTRAINT CK_om_rmv_status CHECK (status IN ('draft','publishing','active','history','failed'))
);
GO
CREATE INDEX IX_om_rmv_aud_status ON dbo.om_richmenu_versions (audience, status, version_no DESC);
GO

-- ทะเบียน LIFF app (ได้ id จาก LINE Developers Console — เก็บไว้ใช้สร้างลิงก์ในเมนู/ข้อความ)
CREATE TABLE dbo.om_liff_apps (
  id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_liff_apps PRIMARY KEY,
  code          NVARCHAR(40) COLLATE Latin1_General_BIN2 NOT NULL,  -- verify / booking / myhome / shop
  name          NVARCHAR(120) NOT NULL,
  liff_id       NVARCHAR(60) COLLATE Latin1_General_BIN2 NULL,      -- ว่าง = ยังไม่ได้ขอจากทีม
  endpoint_path NVARCHAR(200) NOT NULL,                             -- /om/liff, /om/liff/verify ...
  view_size     NVARCHAR(10)  NOT NULL CONSTRAINT DF_om_liff_size DEFAULT 'full', -- full/tall/compact
  is_active     BIT           NOT NULL CONSTRAINT DF_om_liff_act DEFAULT 1,
  note          NVARCHAR(400) NULL,
  updated_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_liff_upd DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT UQ_om_liff_code UNIQUE (code)
);
GO
INSERT INTO dbo.om_liff_apps (code, name, endpoint_path, view_size, note) VALUES
  ('myhome',  N'บ้านของฉัน',        '/om/liff',        'full', N'สิทธิ์ · ประกัน · ประวัติบริการ'),
  ('verify',  N'ยืนยันตัวตน',        '/om/liff/verify', 'tall', N'เบอร์ + OTP → ผูกบ้าน'),
  ('booking', N'จองนัดบริการ',       '/om/liff/booking','full', N'เลือกวัน/slot'),
  ('shop',    N'ร้านค้า O&M',        '/om/liff/shop',   'full', N'แพ็คบริการ + ขอใบเสนอราคาอัปเกรด');
GO
