-- เพิ่มคอลัมน์ district / province ลงตาราง leads
--
-- ทำไม: หน้า Lead Tracking ต้องการคอลัมน์ "เขต/อำเภอ" กับ "จังหวัด" แยกกัน แต่
-- ตาราง leads ไม่เคยเก็บพื้นที่เป็นคอลัมน์จริงเลย ข้อมูลที่มีกระจายอยู่ 2 ที่:
--
--   1. projects.district / projects.province (เพิ่มไว้ตั้งแต่ sql/018) — สะอาดแต่
--      ผูกกับโครงการ ลีดที่ไม่ได้อยู่ในโครงการเสนาจึงไม่มีค่า (593 ลีด มี
--      project_id แค่ 181, มี province จริง 44)
--   2. leads.installation_address — ข้อความอิสระ 456/593 ลีด ส่วนใหญ่เป็นชื่อ
--      จังหวัดล้วน ๆ ที่เว็บฟอร์มส่งมา ("กรุงเทพมหานคร")
--
-- หมายเหตุ: leads.zone ไม่ใช่จังหวัด — migration 118/119 เปลี่ยนไปเก็บโซนเข็มทิศ
-- (โซนเหนือ/ตะวันออก/...) จึงใช้เป็นแหล่งข้อมูลพื้นที่ไม่ได้
--
-- migration 185 เป็นตัว backfill ค่าเข้าคอลัมน์ที่สร้างที่นี่
--
-- เก็บชื่อแบบ "ไม่มีคำนำหน้า" — "ลำลูกกา" ไม่ใช่ "อำเภอลำลูกกา" เพื่อให้ GROUP BY
-- กับตัวกรองทำงานตรง ๆ โดยไม่ต้องสนว่าต้นทางเรียก อำเภอ/เขต/อบต.
-- (ดู src/lib/thai-location.ts)

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'district')
  ALTER TABLE dbo.leads ADD district NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'province')
  ALTER TABLE dbo.leads ADD province NVARCHAR(100) NULL;
GO

-- ใช้กรอง/จัดกลุ่มตามพื้นที่เป็นหลัก จังหวัดนำหน้าเพราะเป็นระดับที่กรองบ่อยกว่า
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'IX_leads_province_district')
  CREATE INDEX IX_leads_province_district ON dbo.leads (province, district);
GO
