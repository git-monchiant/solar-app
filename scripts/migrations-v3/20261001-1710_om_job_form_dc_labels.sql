-- ช่องวัดค่า DC ในใบตรวจรับงาน O&M — ผู้ใช้เปลี่ยนใจ 1 ต.ค. 69 (ต่อจาก 20261001-1700_om_job_form_item_group.sql)
--
-- ไม่รวมแถวแล้ว — แยก 2 ข้อเหมือนเดิม ชื่อสั้นลง:
--   v_dc "แรงดันไฟฟ้าฝั่ง DC" → "แรงดันไฟฟ้า DC" (1 ช่อง · V)
--   i_dc "กระแสไฟฟ้าฝั่ง DC" → "กระแสไฟฟ้า DC"  (1 ช่อง · A)
-- ★ คอลัมน์ group_label คงไว้ (ห้าม drop ช่วง 3 เดือนแรก) — ตอนนี้ไม่มีข้อไหนจับกลุ่ม
-- ★ แก้เฉพาะแถวที่ยังเป็นค่าเดิม — ถ้ามีคนแก้ชื่อในหน้าตั้งค่าใบตรวจไปแล้วไม่ทับ

UPDATE dbo.om_job_form_item
   SET group_label = NULL
 WHERE code IN ('v_dc', 'i_dc') AND group_label = N'แรงดันไฟฟ้า/กระแสไฟฟ้า DC';
GO

UPDATE dbo.om_job_form_item SET label_th = N'แรงดันไฟฟ้า DC'
 WHERE code = 'v_dc' AND label_th = N'แรงดันไฟฟ้าฝั่ง DC';
GO

UPDATE dbo.om_job_form_item SET label_th = N'กระแสไฟฟ้า DC'
 WHERE code = 'i_dc' AND label_th = N'กระแสไฟฟ้าฝั่ง DC';
GO
