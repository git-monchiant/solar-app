-- วิวยอดสิทธิ์คงเหลือ ต้องแยกตามประเภทงาน ไม่งั้นแพ็คตรวจเช็กจะไปบวกรวมกับสิทธิ์ล้างแผง
-- ★ เปลี่ยนความละเอียดของวิว: เดิม 1 แถว/ระบบติดตั้ง → ใหม่ 1 แถว/(ระบบติดตั้ง, ประเภทงาน)
--   ผู้ใช้ฝั่ง LIFF ที่เคย SUM ทั้งหมด ต้องกรอง service_type_code = 'cleaning'
IF OBJECT_ID('dbo.om_entitlement_balance', 'V') IS NOT NULL
  DROP VIEW dbo.om_entitlement_balance;
GO
CREATE VIEW dbo.om_entitlement_balance AS
  WITH cid AS (
    -- ★ GROUP BY ใส่ subquery ตรง ๆ ไม่ได้ — ดึง id ของ 'ล้างแผง' มาเป็นคอลัมน์ก่อนแล้ว cross join
    SELECT TOP 1 id FROM dbo.om_service_type WHERE code = N'cleaning'
  ),
  mv AS (
    -- ให้สิทธิ์ (+) และตัดสิทธิ์ (-) มารวมแกนเดียวกัน แล้วค่อยสรุปทีเดียว
    SELECT g.installation_id, ISNULL(g.service_type_id, c.id) AS service_type_id,
           SUM(g.qty) AS granted, 0 AS used
    FROM dbo.om_entitlement_grants g CROSS JOIN cid c
    GROUP BY g.installation_id, ISNULL(g.service_type_id, c.id)
    UNION ALL
    SELECT r.installation_id, ISNULL(r.service_type_id, c.id),
           0, COUNT(*)
    FROM dbo.om_redemptions r CROSS JOIN cid c
    WHERE r.status = N'used'
    GROUP BY r.installation_id, ISNULL(r.service_type_id, c.id)
  )
  SELECT i.house_id,
         mv.installation_id,
         mv.service_type_id,
         st.code     AS service_type_code,
         st.label_th AS service_type_label,
         SUM(mv.granted) AS total_granted,
         SUM(mv.used)    AS total_used,
         SUM(mv.granted) - SUM(mv.used) AS balance
  FROM mv
  JOIN dbo.om_installations i  ON i.id = mv.installation_id
  JOIN dbo.om_service_type  st ON st.id = mv.service_type_id
  GROUP BY i.house_id, mv.installation_id, mv.service_type_id, st.code, st.label_th;
GO
