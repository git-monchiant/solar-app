-- แยก "รุ่น" ของแผงออกมาเป็นคอลัมน์ของตัวเอง ให้เท่ากับอินเวอร์เตอร์กับแบตเตอรี่
-- ที่มี *_model แยกอยู่แล้ว
--
-- ที่มา: แพ็กเกจ active ทั้ง 19 ตัวเก็บยี่ห้อกับรุ่นปนกันในช่องเดียวเป็น
-- 'TRINA SOLAR รุ่น Vertex N' พอไม่มีรุ่นเป็นคอลัมน์ ช่อง "รุ่น" ในหน้า Warranty
-- และ Install Checklist เลยไม่มี catalogue ให้เลือก ต้องพิมพ์เอง — ผลคือรุ่นแผง
-- เดียวกันถูกพิมพ์ไป 7 แบบใน 29 เคส ('JKM640N-78HL4-BDV' กับ 'JKM640N-7BHL4-BDV'
-- ต่างกันแค่ 8 กับ B)
--
-- packages.panel_brand ไม่ได้ถูกพิมพ์ลงเอกสารใบไหน (ใบเสนอราคา SELECT ไปแต่ไม่ได้
-- render) การตัดคำว่า "รุ่น ..." ออกจากช่องยี่ห้อจึงไม่กระทบเอกสารที่ออกไปแล้ว

IF COL_LENGTH('dbo.packages', 'panel_model') IS NULL
  ALTER TABLE dbo.packages ADD panel_model NVARCHAR(100) NULL;
GO

-- ย้ายข้อความหลังคำว่า "รุ่น" ไปไว้ที่ panel_model แล้วเหลือเฉพาะยี่ห้อในช่องเดิม
-- ใช้ DATALENGTH/2 แทน LEN เพราะ LEN ตัดช่องว่างท้ายทิ้ง ทำให้ตัดคำพลาดไป 1 ตัว
-- รันซ้ำได้: พอแยกเสร็จ panel_brand จะไม่มีคำว่า "รุ่น" ให้ match อีก
DECLARE @sep NVARCHAR(10) = N' รุ่น ';

UPDATE dbo.packages
SET panel_model = LTRIM(RTRIM(SUBSTRING(panel_brand, CHARINDEX(@sep, panel_brand) + DATALENGTH(@sep) / 2, 4000))),
    panel_brand = LTRIM(RTRIM(LEFT(panel_brand, CHARINDEX(@sep, panel_brand) - 1)))
WHERE panel_brand LIKE N'%' + @sep + N'%'
  AND (panel_model IS NULL OR LTRIM(RTRIM(panel_model)) = '');
GO
