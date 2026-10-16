-- หมวด FAQ — ทะเบียนกลาง แทนการพิมพ์อิสระรายข้อ (กันพิมพ์ผิดกลายเป็นหมวดใหม่)
-- om_faq.category ยังเก็บเป็นข้อความ (ไม่ใช้ FK) เพื่อไม่ต้องแก้ข้อมูลเดิม —
-- เปลี่ยนชื่อหมวดจะอัปเดตข้อความใน om_faq ให้ตามในทรานแซกชันเดียวกัน
CREATE TABLE dbo.om_faq_categories (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_om_faq_categories PRIMARY KEY,
  name       NVARCHAR(60) NOT NULL,
  sort_order INT NOT NULL CONSTRAINT DF_om_faqcat_sort DEFAULT 0,   -- คุมลำดับชิปกรองฝั่งลูกค้า
  is_active  BIT NOT NULL CONSTRAINT DF_om_faqcat_act DEFAULT 1,
  created_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_faqcat_created DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT UQ_om_faq_categories_name UNIQUE (name)
);
GO
-- ยกหมวดที่ใช้อยู่แล้วขึ้นทะเบียน โดยคงลำดับตามที่ปรากฏใน FAQ
INSERT INTO dbo.om_faq_categories (name, sort_order)
SELECT category, ROW_NUMBER() OVER (ORDER BY MIN(sort_order)) * 10
FROM dbo.om_faq WHERE category IS NOT NULL AND LTRIM(RTRIM(category)) <> ''
GROUP BY category;
GO
