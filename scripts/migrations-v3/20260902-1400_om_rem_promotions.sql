-- โปรโมชันที่แถมตอนขาย — REM ส่งมาในช่อง promotions[] ของ /api/saleorder/transfer
-- ★ ตอนดึงรอบแรก (2 ก.ย.) ผมมองข้ามช่องนี้ไป ทั้งที่เป็นที่เดียวที่บอกว่า "แถมโซลาร์ไหม"
-- ที่พบ: สัญญา 8,186 ใบ · มีโปรฯ อย่างน้อย 1 รายการ 1,174 ใบ · เป็นโปรฯ โซลาร์ 226 หลัง
--   ชื่อโปรฯ เช่น "Solar Roof 3.0 kw." · "ระบบบ้าน ZEH และ Solar Rooftop 3 kw.+O&M 2 ปี" · "ฟรี Solar Roof 3.0 kw."
-- ★ ห้ามใช้ตารางนี้ตัดสินว่า "บ้านนี้มีโซลาร์ไหม" — มันบอกแค่ "แถมตอนขายไหม"
--   บ้าน O&M ของเรา 1,643 หลัง แต่ REM มีโปรฯ โซลาร์แค่ 178 หลังที่ตรงกัน (11%)
--   ที่เหลือได้โซลาร์มาทางอื่น (มากับแบบบ้าน / ซื้อเอง / ติดทีหลัง) ซึ่ง REM ไม่บันทึกไว้
-- ★ REM ส่งแถวซ้ำหลายแถวต่อโปรฯ เดียว — กันด้วย PK (contract_id, p_detail_id, promotion_id)

IF OBJECT_ID('dbo.om_rem_promotions') IS NULL
CREATE TABLE dbo.om_rem_promotions (
  contract_id     NVARCHAR(80)  COLLATE Latin1_General_BIN2 NOT NULL,
  p_detail_id     INT           NOT NULL,
  promotion_id    NVARCHAR(40)  COLLATE Latin1_General_BIN2 NOT NULL,
  m_promotion_id  NVARCHAR(40)  COLLATE Latin1_General_BIN2 NULL,
  promotion_type  NVARCHAR(4)   NULL,          -- G = ของแถม
  promotion_name  NVARCHAR(400) NULL,          -- ★ ว่างได้บ่อย — ต้องดู description ด้วย
  description1    NVARCHAR(400) NULL,
  description2    NVARCHAR(400) NULL,
  price           DECIMAL(14,2) NULL,
  percent_from    NVARCHAR(40)  NULL,
  is_standard     BIT           NOT NULL CONSTRAINT DF_om_rem_promo_std DEFAULT 0,  -- ตามมาตรฐานโครงการ
  -- ธงที่คำนวณไว้ตอนนำเข้า: ชื่อหรือคำบรรยายพูดถึงโซลาร์ไหม (ค้นทีหลังจะได้ไม่ต้อง LIKE ทุกครั้ง)
  is_solar        BIT           NOT NULL CONSTRAINT DF_om_rem_promo_solar DEFAULT 0,
  synced_at       DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_rem_promo_at DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT PK_om_rem_promotions PRIMARY KEY (contract_id, p_detail_id, promotion_id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_promo_solar')
CREATE INDEX IX_om_rem_promo_solar ON dbo.om_rem_promotions(is_solar) INCLUDE (contract_id, promotion_name) WHERE is_solar = 1;
GO
