-- O&M: แยกส่วนชื่อลูกค้า (คำนำหน้า/ชื่อ/นามสกุล) — ตามแผน docs แผน 20260828_01 ข้อ 8
-- full_name ยังเป็นค่าหลักเสมอ · สามคอลัมน์ใหม่เป็นส่วนแยกไว้ค้นหา/แสดงผล
IF COL_LENGTH('om_customers', 'title') IS NULL
BEGIN
  ALTER TABLE om_customers ADD
    title      NVARCHAR(40)  NULL,
    first_name NVARCHAR(120) NULL,
    last_name  NVARCHAR(120) NULL;
END
GO

-- backfill จาก full_name ที่มีอยู่ 4,808 แถว
-- ★ ไม่แตะแถวนิติบุคคล/ไม่ใช่ชื่อบุคคล — เก็บไว้ที่ full_name อย่างเดียว
WITH t AS (
  SELECT * FROM (VALUES (N'นางสาว'), (N'น.ส.'), (N'ด.ช.'), (N'ด.ญ.'), (N'นาย'), (N'นาง'), (N'คุณ'), (N'ดร.')) v(pre)
),
pick AS (
  SELECT c.id, c.full_name, x.pre,
         ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY LEN(x.pre) DESC) rn
  FROM om_customers c
  JOIN t x ON c.full_name LIKE x.pre + N'%' COLLATE Thai_CS_AS
  WHERE c.first_name IS NULL
    AND c.full_name NOT LIKE N'%บริษัท%' AND c.full_name NOT LIKE N'%จำกัด%'
    AND c.full_name NOT LIKE N'%นิติบุคคล%' AND c.full_name NOT LIKE N'%สำนักงาน%'
    AND c.full_name NOT LIKE N'%หจก%'
    -- กันคำที่ขึ้นต้นเหมือนคำนำหน้าแต่เป็นส่วนของชื่อ เช่น "นายิกา" (ตัวถัดไปเป็นสระ/วรรณยุกต์ = ไม่ตัด)
    AND SUBSTRING(LTRIM(STUFF(c.full_name, 1, LEN(x.pre), N'')), 1, 1)
        NOT LIKE N'[ะัาำิีึืุู็่้๊๋์ๆ]' COLLATE Thai_CS_AS
    AND LEN(LTRIM(STUFF(c.full_name, 1, LEN(x.pre), N''))) >= 2
)
UPDATE c SET
  c.title = p.pre,
  c.first_name = CASE WHEN CHARINDEX(N' ', rest.v) > 0 THEN LEFT(rest.v, CHARINDEX(N' ', rest.v) - 1) ELSE rest.v END,
  c.last_name  = CASE WHEN CHARINDEX(N' ', rest.v) > 0 THEN NULLIF(LTRIM(SUBSTRING(rest.v, CHARINDEX(N' ', rest.v) + 1, 200)), N'') ELSE NULL END
FROM om_customers c
JOIN pick p ON p.id = c.id AND p.rn = 1
CROSS APPLY (SELECT LTRIM(RTRIM(STUFF(c.full_name, 1, LEN(p.pre), N'')))) rest(v);
GO

-- แถวที่ไม่มีคำนำหน้า: แยกชื่อ/นามสกุลตรง ๆ (ข้ามนิติบุคคลเช่นกัน)
UPDATE c SET
  c.first_name = CASE WHEN CHARINDEX(N' ', nm.v) > 0 THEN LEFT(nm.v, CHARINDEX(N' ', nm.v) - 1) ELSE nm.v END,
  c.last_name  = CASE WHEN CHARINDEX(N' ', nm.v) > 0 THEN NULLIF(LTRIM(SUBSTRING(nm.v, CHARINDEX(N' ', nm.v) + 1, 200)), N'') ELSE NULL END
FROM om_customers c
CROSS APPLY (SELECT LTRIM(RTRIM(c.full_name))) nm(v)
WHERE c.first_name IS NULL AND nm.v <> N''
  AND c.full_name NOT LIKE N'%บริษัท%' AND c.full_name NOT LIKE N'%จำกัด%'
  AND c.full_name NOT LIKE N'%นิติบุคคล%' AND c.full_name NOT LIKE N'%สำนักงาน%'
  AND c.full_name NOT LIKE N'%หจก%';
GO
