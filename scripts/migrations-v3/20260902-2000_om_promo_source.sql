-- ระบุที่มาของแต่ละแถวโปรโมชัน — itf (ไม่ครบ) หรือ BookingInfo v2 (ครบ)
-- ทำไม: BookingInfo ให้ของแถมครบกว่า itf มาก (146/1: 5 → 16 รายการ) แต่ host เดียวกับ
--   ContactInfo ที่มีช่องโหว่ ⇒ ต้องแยกได้ว่าแถวไหนมาจากไหน เผื่อต้องถอนกลับ
-- ★ ไม่มีคอลัมน์ราคา — ผู้ใช้เคาะว่าไม่เก็บราคาของแถมเลย (ทั้ง itf และ v2)

IF COL_LENGTH('dbo.om_rem_promotions','source') IS NULL
  ALTER TABLE dbo.om_rem_promotions ADD source NVARCHAR(20) NOT NULL CONSTRAINT DF_om_promo_src DEFAULT 'itf';
GO
-- ของเดิมทั้งหมดมาจาก itf/saleorder/transfer
UPDATE dbo.om_rem_promotions SET source = 'itf' WHERE source IS NULL OR source = '';
GO
-- p_detail_id + promotion_id ของ v2 เป็นเลขที่เราตั้งเอง (V2/ลำดับ) — PK เดิมอาจชนกับ itf
-- ต้องให้ contract หนึ่งเก็บได้ทั้งชุด itf และชุด v2 แยกกัน จึงเพิ่ม source เข้า PK
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_om_rem_promotions')
  ALTER TABLE dbo.om_rem_promotions DROP CONSTRAINT PK_om_rem_promotions;
GO
ALTER TABLE dbo.om_rem_promotions
  ADD CONSTRAINT PK_om_rem_promotions PRIMARY KEY (contract_id, source, p_detail_id, promotion_id);
GO
