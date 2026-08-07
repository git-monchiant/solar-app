-- 143: ระบุ Lead ที่ยังใช้ราคาเก่าได้ (package_price_periods.allowed_lead_ids)
--
-- ปกติใบเสนอราคาต้องใช้ราคาของช่วงที่ Active เท่านั้น แต่บางเคสคุยราคากับลูกค้า
-- ไว้ตั้งแต่เดือนก่อนแล้วเพิ่งมาออกเอกสาร จึงต้องเปิดให้เฉพาะ Lead ที่ระบุไว้
-- เลือกราคาของช่วงที่ผ่านมาแล้วได้
--
-- เก็บเป็นรายการ id คั่นด้วยจุลภาค เช่น '123,333,444' — ตั้งใจให้ง่ายต่อการแก้จาก
-- หน้า Package Management ไม่ต้องมีตารางความสัมพันธ์แยก

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('package_price_periods') AND name = 'allowed_lead_ids'
)
  ALTER TABLE package_price_periods ADD allowed_lead_ids NVARCHAR(500) NULL;
