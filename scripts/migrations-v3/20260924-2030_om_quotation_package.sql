-- Package O&M ที่ใบเสนอราคา O&M เลือก (แผน docs/plan/20260924-02 เฟส 2)
--
-- ★ ทำไมไม่ใช้ quotations.package_id: คอลัมน์นั้นฝั่งขาย JOIN กับ packages ของฝั่งขาย
--   (GET ใบของ lead, คิวอนุมัติ, PDF) — ใส่ id ของ om_packages ลงไปจะไปชนแพ็กเกจขายที่ id ตรงกัน
--   แล้วโชว์ชื่อ/รายการอุปกรณ์ผิดใบ ⇒ ใบ O&M ให้ package_id = NULL เสมอ แล้วเก็บของเราแยกที่นี่
-- ★ ชื่อ/ราคา ณ วันออกใบยังอยู่ใน package_name_snapshot / package_price_snapshot เหมือนฝั่งขาย
--   คอลัมน์นี้มีไว้ให้ฟอร์มแก้ใบเปิดมาแล้วเลือกแพ็กเกจเดิมไว้ให้

IF COL_LENGTH('dbo.quotations', 'om_package_id') IS NULL
  ALTER TABLE dbo.quotations ADD om_package_id INT NULL;
GO
