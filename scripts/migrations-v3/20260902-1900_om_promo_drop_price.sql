-- ★ ไม่เก็บราคาของแถมเลย — ผู้ใช้เคาะ 2 ก.ย. "ข้อมูลดิบก็ไม่เอาราคา"
-- เหตุผล: ราคาของแถม (ชุดครัว/แอร์/จัดสวน ฯลฯ) เป็นข้อมูลฝั่งขาย
--   งาน O&M ไม่มีเหตุต้องรู้ ⇒ ไม่เก็บดีกว่าเก็บแล้วต้องระวังไม่ให้หลุด
-- ที่เราต้องใช้จริงคือ "แถมโซลาร์ไหม · กี่ kW · O&M กี่ปี" ซึ่งอยู่ในชื่อโปรฯ อยู่แล้ว

IF COL_LENGTH('dbo.om_rem_promotions','price') IS NOT NULL
  ALTER TABLE dbo.om_rem_promotions DROP COLUMN price;
GO
IF COL_LENGTH('dbo.om_rem_promotions','percent_from') IS NOT NULL
  ALTER TABLE dbo.om_rem_promotions DROP COLUMN percent_from;
GO
-- ★ ราคายังฝังอยู่ใน om_rem_transfers.raw ด้วย (เก็บ promotions ทั้งก้อนไว้ตอน sync)
--   ตัด key promotions ออกจาก raw — ข้อมูลโปรฯ ที่ต้องใช้อยู่ในตาราง om_rem_promotions แล้ว
UPDATE dbo.om_rem_transfers
   SET raw = JSON_MODIFY(raw, '$.promotions', NULL)
 WHERE raw IS NOT NULL AND ISJSON(raw) = 1 AND raw LIKE '%"promotions"%';
GO
