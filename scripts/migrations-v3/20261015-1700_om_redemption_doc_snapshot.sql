-- ใบบริการ O&M แสดง "ครั้งที่ · คงเหลือ" ของสิทธิ์ล้างแผง (แผน docs/plan/20261015-04-om-service-doc-quota-count.md · ผู้ใช้เคาะ 15 ต.ค. 69)
--
-- ★ ทำไมจดไว้ในแถวตัดสิทธิ์ ไม่คิดตอนเปิดใบ:
--   ใบ PDF สร้างใหม่ทุกครั้งที่เปิด — คิดจากยอดปัจจุบัน ใบที่ลูกค้าเซ็นไปแล้วจะเปลี่ยนเลขตามการล้าง/ซื้อเพิ่มครั้งหลัง ๆ
--   จดตอนปิดงาน (PATCH /api/om/bookings/[id]) ⇒ ตัวเลขแช่ตามวันนั้น · ย้อนสถานะงาน แถวเป็น void ตัวเลขหายตาม
-- seq_no        = ครั้งที่ของชนิดงานนี้ในบ้านนี้ (นับแถว used รวมแถวนี้)
-- balance_after = คงเหลือหลังตัดแถวนี้ — ติดลบได้ (ทำงานเกินสิทธิ์) ใบลูกค้าแสดง 0
-- NULL = แถวที่ไม่ได้มาจากการปิดงาน (ลงประวัติด้วยมือ / นำเข้า) — ไม่มีใบบริการให้แสดง

IF COL_LENGTH('dbo.om_redemptions', 'seq_no') IS NULL
  ALTER TABLE dbo.om_redemptions ADD seq_no INT NULL;
IF COL_LENGTH('dbo.om_redemptions', 'balance_after') IS NULL
  ALTER TABLE dbo.om_redemptions ADD balance_after INT NULL;
GO

-- เติมย้อนหลังให้ใบงานที่ปิดไปแล้ว — ไล่สมุดสิทธิ์ของบ้านตามลำดับที่บันทึก (ค่าโดยประมาณ ณ วันปิดงาน)
--   ครั้งที่  = แถว used ของบ้าน + ชนิดงานเดียวกัน ที่ id ≤ แถวนี้
--   คงเหลือ = สิทธิ์ที่เติมก่อนเวลาของแถวนี้ − ครั้งที่
--   ★ แถวที่ void ไปแล้วไม่นับ (ตอนปิดงานจริงอาจเคยนับอยู่) · ตอนเขียนมีแถวที่ผูกใบงาน 19 แถว (solardb_v3 · 15 ต.ค. 69)
DECLARE @c INT = (SELECT TOP 1 id FROM dbo.om_service_type WHERE code = N'cleaning');

;WITH r AS (
  SELECT rd.id, rd.created_at, i.house_id, ISNULL(rd.service_type_id, @c) st
    FROM dbo.om_redemptions rd JOIN dbo.om_installations i ON i.id = rd.installation_id
   WHERE rd.status = N'used'
)
UPDATE rd
   SET seq_no = x.n, balance_after = x.g - x.n
  FROM dbo.om_redemptions rd
  JOIN r ON r.id = rd.id
 CROSS APPLY (SELECT
     (SELECT COUNT(*) FROM r r2 WHERE r2.house_id = r.house_id AND r2.st = r.st AND r2.id <= r.id) n,
     (SELECT ISNULL(SUM(g.qty), 0) FROM dbo.om_entitlement_grants g JOIN dbo.om_installations gi ON gi.id = g.installation_id
       WHERE gi.house_id = r.house_id AND ISNULL(g.service_type_id, @c) = r.st AND g.created_at <= r.created_at) g) x
 WHERE rd.booking_id IS NOT NULL AND rd.seq_no IS NULL;
GO
