-- ช่องติดต่อลูกค้า O&M: อีเมล · LINE ID (ผู้ใช้สั่ง 21 ต.ค. 69 "เพิ่มช่อง email, line id")
--
-- ★ contact_line_id = LINE ID ที่ลูกค้าบอก (เช่น @somchai) กรอกเองจากหน้าจอ
--   คนละอย่างกับ om_line_users.line_user_id (รหัส U… ที่ได้ตอนลูกค้าเชื่อมบัญชีผ่าน LINE OA)
--   และ leads.line_id ฝั่งขายซึ่งก็เป็นรหัส U… แบบเดียวกัน ⇒ ไม่คัดลอกช่องนั้นมา
-- ★ อีเมลดึงจากลีดงานขายให้ลูกค้าที่ระบบสร้างจากงานขาย (sales-sweep ทำต่อให้บ้านใหม่)
--   ตอนเขียน (solardb_v3 · 21 ต.ค. 69): บ้านจากงานขาย 25 หลัง มีอีเมลในลีด 4 หลัง

IF COL_LENGTH('dbo.om_customers', 'email') IS NULL
  ALTER TABLE dbo.om_customers ADD email NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.om_customers', 'contact_line_id') IS NULL
  ALTER TABLE dbo.om_customers ADD contact_line_id NVARCHAR(100) NULL;
GO

-- เติมเฉพาะลูกค้าที่ยังไม่มีอีเมล · อีเมลต้องมีรูป x@y.z (ไม่เอาค่าขยะจากฟอร์มขาย)
UPDATE c SET email = LTRIM(RTRIM(l.email)), updated_at = SYSDATETIMEOFFSET()
  FROM dbo.om_customers c
  JOIN dbo.om_house_customers hc ON hc.customer_id = c.id AND hc.is_current = 1 AND hc.role = 'owner'
  JOIN dbo.om_houses h ON h.id = hc.house_id
  JOIN dbo.leads l ON l.id = h.lead_id
 WHERE c.email IS NULL
   AND LTRIM(RTRIM(ISNULL(l.email, N''))) LIKE N'_%@_%._%'
   AND CHARINDEX(N' ', LTRIM(RTRIM(l.email))) = 0;
GO
