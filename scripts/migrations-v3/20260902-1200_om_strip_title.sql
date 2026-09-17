-- ตัดคำนำหน้าชื่อไทย เพื่อเทียบชื่อคนโดยไม่ติดคำนำหน้า
-- ทำไม: ข้อมูลนำเข้าเก่าเก็บ "เชนิสา มัณยานนท์" แต่ระบบขายเก็บ "คุณเชนิสา มัณยานนท์"
--       ถ้าเทียบตรง ๆ จะกลายเป็นคนละคน แล้ว sweep สร้างลูกค้าซ้ำ (เจอจริงตอนทดสอบ 2 ก.ย.)
-- ★ ต้องเรียงคำยาวก่อนคำสั้น ("นายแพทย์" ก่อน "นาย" · "นางสาว" ก่อน "นาง")

IF OBJECT_ID('dbo.om_strip_title') IS NOT NULL DROP FUNCTION dbo.om_strip_title;
GO
CREATE FUNCTION dbo.om_strip_title (@s NVARCHAR(400))
RETURNS NVARCHAR(400)
WITH SCHEMABINDING
AS
BEGIN
  DECLARE @t NVARCHAR(400) = LTRIM(RTRIM(ISNULL(@s, N'')));
  IF @t LIKE N'นายแพทย์%'  SET @t = LTRIM(SUBSTRING(@t, 9, 400));
  ELSE IF @t LIKE N'แพทย์หญิง%' SET @t = LTRIM(SUBSTRING(@t, 10, 400));
  ELSE IF @t LIKE N'นางสาว%'  SET @t = LTRIM(SUBSTRING(@t, 7, 400));
  ELSE IF @t LIKE N'น.ส.%'    SET @t = LTRIM(SUBSTRING(@t, 5, 400));
  ELSE IF @t LIKE N'ด.ช.%'    SET @t = LTRIM(SUBSTRING(@t, 5, 400));
  ELSE IF @t LIKE N'ด.ญ.%'    SET @t = LTRIM(SUBSTRING(@t, 5, 400));
  ELSE IF @t LIKE N'บริษัท%'   SET @t = LTRIM(SUBSTRING(@t, 7, 400));
  ELSE IF @t LIKE N'บจก.%'    SET @t = LTRIM(SUBSTRING(@t, 5, 400));
  ELSE IF @t LIKE N'หจก.%'    SET @t = LTRIM(SUBSTRING(@t, 5, 400));
  ELSE IF @t LIKE N'คุณ%'      SET @t = LTRIM(SUBSTRING(@t, 4, 400));
  ELSE IF @t LIKE N'นาย%'     SET @t = LTRIM(SUBSTRING(@t, 4, 400));
  ELSE IF @t LIKE N'นาง%'     SET @t = LTRIM(SUBSTRING(@t, 4, 400));
  ELSE IF @t LIKE N'ดร.%'     SET @t = LTRIM(SUBSTRING(@t, 4, 400));
  ELSE IF @t LIKE N'พญ.%'     SET @t = LTRIM(SUBSTRING(@t, 4, 400));
  ELSE IF @t LIKE N'นพ.%'     SET @t = LTRIM(SUBSTRING(@t, 4, 400));
  RETURN LTRIM(RTRIM(@t));
END
GO
