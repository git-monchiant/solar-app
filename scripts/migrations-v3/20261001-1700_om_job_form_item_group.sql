-- กลุ่มช่องวัดค่าในใบตรวจรับงาน O&M (ผู้ใช้สั่ง 1 ต.ค. 69)
--
-- "แรงดันไฟฟ้าฝั่ง DC" (v_dc · V) กับ "กระแสไฟฟ้าฝั่ง DC" (i_dc · A) แสดงเป็นแถวเดียว
--   ป้าย "แรงดันไฟฟ้า/กระแสไฟฟ้า DC" + ช่องกรอก 2 ช่อง
-- ★ หัวข้อในใบมาจากฐาน (ห้าม hardcode ในโค้ด) ⇒ เก็บการจับกลุ่มเป็นข้อมูล
--   ข้อที่ group_label เดียวกันและอยู่ติดกัน = แถวเดียว ป้ายเดียว หลายช่อง (JobFormPanel)
-- ★ คำตอบยังเก็บแยกตาม code เดิม (measures.v_dc / measures.i_dc) — ใบตรวจเก่า / PDF ไม่กระทบ
-- ★ nullable — ข้ออื่นไม่จับกลุ่ม แสดงแบบเดิม

IF COL_LENGTH('dbo.om_job_form_item', 'group_label') IS NULL
  ALTER TABLE dbo.om_job_form_item ADD group_label NVARCHAR(100) NULL;
GO

UPDATE dbo.om_job_form_item
   SET group_label = N'แรงดันไฟฟ้า/กระแสไฟฟ้า DC'
 WHERE code IN ('v_dc', 'i_dc') AND group_label IS NULL;
GO
