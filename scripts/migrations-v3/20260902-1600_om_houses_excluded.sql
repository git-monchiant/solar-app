-- ซ่อนบ้านที่ "ไม่ได้ติดโซลาร์" ออกจากงาน O&M — ★ ซ่อน ไม่ใช่ลบ
-- ผู้ใช้เคาะ 2 ก.ย. (ตัวเลือก ก): ซ่อนเฉพาะหลังที่ตอนนำเข้าจดหมายเหตุไว้ตรง ๆ ว่าไม่ได้ติด
--   ("ไม่ติดโซลาร์เซลล์" · "ไม่ได้ติด โซลาร์" · "ไม่ได้ติอตั้งโซลาร์" · "ไม่ได้ติดโซล่า") = 48 หลัง
--   ไม่เอาขอบเขตกว้างกว่านั้น เพราะอีก 222 หลังที่ไม่มีสเปกระบบ ล้วนมีสิทธิ์ล้างจาก contract_base
--   ⇒ มีคนตั้งใจขายสัญญา O&M ให้ = น่าจะข้อมูลตกหล่น ไม่ใช่ไม่มีแผง
--
-- กลไก: ใช้ is_om เป็นสวิตช์เดิม (ทุก query กรอง is_om = 1 อยู่แล้ว) + จดเหตุผลไว้ในคอลัมน์ใหม่
--   ข้อมูลบ้าน · ลูกค้า · สิทธิ์ · ประวัติล้าง อยู่ครบทุกแถว เปิดกลับได้ทันที

IF COL_LENGTH('dbo.om_houses','om_excluded_reason') IS NULL
  ALTER TABLE dbo.om_houses ADD om_excluded_reason NVARCHAR(300) NULL;
GO
IF COL_LENGTH('dbo.om_houses','om_excluded_at') IS NULL
  ALTER TABLE dbo.om_houses ADD om_excluded_at DATETIMEOFFSET NULL;
GO
IF COL_LENGTH('dbo.om_houses','om_excluded_by') IS NULL
  ALTER TABLE dbo.om_houses ADD om_excluded_by INT NULL;
GO
-- ★ index กรองเฉพาะที่ "เราสั่งซ่อน" — แยกจากบ้าน is_om=0 อีก 3,113 หลังที่ไม่เคยอยู่ในขอบเขต O&M เลย
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_houses_excluded')
CREATE INDEX IX_om_houses_excluded ON dbo.om_houses(om_excluded_at DESC)
  INCLUDE (house_number, project_id, om_excluded_reason) WHERE om_excluded_reason IS NOT NULL;
GO
