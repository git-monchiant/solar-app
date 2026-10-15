-- ข้อความในใบเสนอราคา O&M ตามใบตัวอย่างของบริษัท (ผู้ใช้ส่งรูป 14 ต.ค. 69 · แผน docs/plan/20261014-04-om-quote-package-wording.md)
--
-- ① ขอบเขตงานของแพ็กเกจ (om_packages.scope) = รายละเอียดตั้งต้นใต้หัวข้อแพ็กเกจในใบ + หน้าแคตตาล็อก
--    เปลี่ยนเป็นบรรทัดละข้อ (เดิมคั่นด้วย "+") · ตัวเลขครั้ง/เดือนเขียนลงข้อความของแต่ละแพ็กเกจตรง ๆ
--    (ผู้ใช้สั่ง 14 ต.ค. "กรอกตาม package แต่ละ package ได้เลย" — ไม่ใช้ตัวแทนค่า) · คิดจาก visits / contract_months ของแถวนั้นตอนรัน
--    เอา "ใบงานสรุปผล" + "งานแจ้งซ่อม" กลับ (เคยตัดตาม 20261002-1700) — งานแจ้งซ่อมเฉพาะแบบสัญญา
--    "ไม่เกิน 6 ครั้ง" เป็นข้อความในใบเท่านั้น ระบบไม่นับสิทธิ์ (ผู้ใช้เคาะ 14 ต.ค. "ยังไม่เอางานระบบแจ้งซ่อม")
-- ② หมายเหตุ Package O&M (om_package_notes) = หัวข้อ "หมายเหตุ" ท้ายใบ — ที่เดียวที่ใช้
--    (หน้าแคตตาล็อก/หน้าจัดการเลิกแสดงตั้งแต่ 24 ก.ย. · commit c489fef) ⇒ แทน 2 ข้อเดิมด้วย 2 ข้อของใบตัวอย่าง
-- ★ ทับเฉพาะขอบเขตงานที่ยังเป็นชุดมาตรฐาน (seed เดิม / หลังตัด 2 ต.ค.) — แอดมินแก้เป็นอย่างอื่นแล้วไม่แตะ · รันซ้ำได้
-- ★ ใบเสนอราคาที่ออกไปแล้วไม่เปลี่ยน — รายละเอียดเก็บเป็นแถวของใบ · ข้อความท้ายใบแช่ใน terms_text / snapshot

DECLARE @nl NCHAR(1) = NCHAR(10);

UPDATE dbo.om_packages
   SET scope = N'งานล้างทำความสะอาดแผงโซลาร์เซลล์ (Solar Panel Cleaning) จำนวน ' + CAST(ISNULL(visits, 2) AS NVARCHAR(5))
               + N' ครั้ง ภายในระยะเวลา ' + CAST(ISNULL(contract_months, 12) AS NVARCHAR(5)) + N' เดือน' + @nl
             + N'งานตรวจเช็คระบบไฟฟ้าและอุปกรณ์ป้องกัน (Electrical System Inspection) จำนวน ' + CAST(ISNULL(visits, 2) AS NVARCHAR(5))
               + N' ครั้ง ภายในระยะเวลา ' + CAST(ISNULL(contract_months, 12) AS NVARCHAR(5)) + N' เดือน' + @nl
             + N'งานตรวจเช็คการทำงานของอินเวอร์เตอร์ จำนวน ' + CAST(ISNULL(visits, 2) AS NVARCHAR(5))
               + N' ครั้ง ภายในระยะเวลา ' + CAST(ISNULL(contract_months, 12) AS NVARCHAR(5)) + N' เดือน' + @nl
             + N'ใบงานสรุปผลการบำรุงรักษา (O&M Service Report)' + @nl
             + N'งานแจ้งซ่อมกรณีระบบโซลาร์ทำงานผิดปกติ จำนวนไม่เกิน 6 ครั้ง ภายในระยะเวลา ' + CAST(ISNULL(contract_months, 12) AS NVARCHAR(5)) + N' เดือน',
       updated_at = SYSDATETIMEOFFSET()
 WHERE plan_type = 'contract'
   AND scope IN (N'ล้างแผง+ตรวจสอบระบบ',
                 N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน+ตรวจเช็คตามการแจ้งซ่อมระหว่างสัญญา');

UPDATE dbo.om_packages
   SET scope = N'งานล้างทำความสะอาดแผงโซลาร์เซลล์ (Solar Panel Cleaning) จำนวน 1 ครั้ง' + @nl
             + N'งานตรวจเช็คระบบไฟฟ้าและอุปกรณ์ป้องกัน (Electrical System Inspection) จำนวน 1 ครั้ง' + @nl
             + N'งานตรวจเช็คการทำงานของอินเวอร์เตอร์ จำนวน 1 ครั้ง' + @nl
             + N'ใบงานสรุปผลการบำรุงรักษา (O&M Service Report)',
       updated_at = SYSDATETIMEOFFSET()
 WHERE plan_type = 'per_visit'
   AND scope IN (N'ล้างแผง+ตรวจสอบระบบ',
                 N'ล้างแผง+ตรวจสอบระบบ+ออกใบงานแจ้งผลการดำเนินงาน');

-- ② หมายเหตุ — ลบเฉพาะ 2 ข้อเดิม (seed 20260924-1400) แล้วเพิ่ม 2 ข้อใหม่ถ้ายังไม่มี
DELETE FROM dbo.om_package_notes
 WHERE body LIKE N'ค่าบริการดังกล่าวไม่รวมค่าวัสดุอุปกรณ์ของระบบผลิตพลังงานโซลาร์เซลล์ทุกกรณี%'
    OR body LIKE N'ก่อนการขึ้นล้างแผง การให้บริการจะเก็บค่าบริการก่อนการนัดหมาย%';

IF NOT EXISTS (SELECT 1 FROM dbo.om_package_notes WHERE body LIKE N'ใบเสนอราคานี้ขอสงวนสิทธิ์เฉพาะค่าแรงและเครื่องมือ%')
  INSERT INTO dbo.om_package_notes (body, sort_order, updated_at)
  VALUES (N'ใบเสนอราคานี้ขอสงวนสิทธิ์เฉพาะค่าแรงและเครื่องมือที่ใช้ในการทำงานเท่านั้น ไม่รวมค่าอะไหล่ที่ใช้ในการซ่อมแซม', 1, SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM dbo.om_package_notes WHERE body LIKE N'ในกรณีตรวจสอบพบความผิดปกติของการทำงานระบบโซลาร์เซลล์%')
  INSERT INTO dbo.om_package_notes (body, sort_order, updated_at)
  VALUES (N'ในกรณีตรวจสอบพบความผิดปกติของการทำงานระบบโซลาร์เซลล์ ผู้ให้บริการจะต้องแจ้งราคาค่าใช้จ่ายของอุปกรณ์ให้ผู้รับบริการทราบทุกครั้ง', 2, SYSDATETIMEOFFSET());
GO
