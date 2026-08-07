-- 142: ราคาเดือน ก.ค. 2569 เป็นช่วงราคาย้อนหลัง (inactive) ของแต่ละ Package
--
-- ตารางราคาที่ฝ่ายขายใช้เดือน ก.ค. 2569 ต่ำกว่าราคาปัจจุบันทุกรายการ (+1,000 ถึง
-- +16,000) ใบเสนอราคาที่ออกไปในเดือนนั้นจึงเป็นคนละราคากับที่เห็นในระบบตอนนี้
-- เช่น 7 kWp 1 เฟส + Battery ออกใบที่ 290,000 แต่ราคาปัจจุบันคือ 306,000
-- ใส่เป็นช่วงราคา 01/07/2569–31/07/2569 ไว้เป็นประวัติ
--
-- ทุกแถวเป็น is_active = 0 เท่านั้น ราคาที่ระบบใช้จริง (packages.price) ไม่ถูกแตะ
-- ต้องรันหลัง migration 141 ที่สร้างตาราง package_price_periods
--
-- idempotent: ข้าม package ที่มีช่วง 01/07/2026 อยู่แล้ว และข้าม id ที่ไม่มีในระบบ

IF OBJECT_ID('package_price_periods', 'U') IS NULL
  THROW 50000, 'ต้องรัน migration 141 (สร้างตาราง package_price_periods) ก่อน', 1;

;WITH july(package_id, price) AS (
  SELECT * FROM (VALUES
    -- ติดตั้งใหม่ ไม่มีแบตเตอรี่ (On-Grid)
    ( 1, 112000),   -- 3 kWp 1 เฟส
    ( 2, 139000),   -- 5 kWp 1 เฟส
    ( 3, 225000),   -- 10 kWp 1 เฟส
    (25, 423000),   -- 20 kWp 3 เฟส
    -- ติดตั้งใหม่ + แบตเตอรี่ (Hybrid)
    (17, 275000),   -- 5 kWp + แบต 9.6 kWh (15/45A)
    ( 4, 290000),   -- 7 kWp 1 เฟส + แบต 9.6 kWh (30/100A)
    ( 5, 320000),   -- 7 kWp 3 เฟส + แบต 9.6 kWh (30/100A)
    ( 6, 386000),   -- 10 kWp 1 เฟส + แบต 9.6 kWh (30/100A)
    ( 7, 400000),   -- 10 kWp 3 เฟส + แบต 9.6 kWh (30/100A)
    (26,  41900),   -- เพิ่มแบตเตอรี่ 4.8 kWh
    -- Scale Up
    (18, 145000),   -- + แบต 7 kWh (On-Grid เดิม 3 kWp)
    (19, 145000),   -- + แบต 7 kWh (On-Grid เดิม 5 kWp)
    (20, 235000),   -- + แบต 14 kWh (On-Grid เดิม 5 kWp)
    (21, 160000),   -- + แบต 7 kWh + PV 3 แผง (เดิม 3 kWp)
    (24, 154000),   -- + แบต 7 kWh + PV 2 แผง (เดิม 3 kWp)
    (22, 160000),   -- + แบต 7 kWh + PV 3 แผง (เดิม 5 kWp)
    (27, 154000),   -- + แบต 7 kWh + PV 2 แผง (เดิม 5 kWp)
    (23, 250000),   -- + แบต 14 kWh + PV 3 แผง (เดิม 5 kWp)
    (28,  13000),   -- + PV 2 แผง เป็น 4.4 kWp (เดิม 3 kWp)
    (29,  20000),   -- + PV 3 แผง เป็น 5 kWp (เดิม 3 kWp)
    (30,  13000),   -- + PV 2 แผง เป็น 6.4 kWp (เดิม 5 kWp)
    (31,  20000)    -- + PV 3 แผง เป็น 7 kWp (เดิม 5 kWp)
  ) v(package_id, price)
)
INSERT INTO package_price_periods (package_id, price, start_date, expire_date, is_active, note)
SELECT j.package_id, j.price, '2026-07-01', '2026-07-31', 0, N'ราคาเดือน ก.ค. 2569'
FROM july j
JOIN packages p ON p.id = j.package_id
-- ข้ามเฉพาะแถวที่ migration นี้เคยใส่ไว้แล้ว (ดูจาก note) ไม่ใช่ทุกแถวที่เริ่ม 01/07
-- เพราะบาง package มีช่วงราคาที่ใช้อยู่เริ่ม 01/07 อยู่ก่อนแล้วจาก migration 141
WHERE NOT EXISTS (
  SELECT 1 FROM package_price_periods x
  WHERE x.package_id = j.package_id
    AND x.start_date = '2026-07-01'
    AND x.note = N'ราคาเดือน ก.ค. 2569'
);

-- กันพลาด: แถวราคาเดือน ก.ค. ที่ migration นี้ใส่ ต้องเป็น inactive ทั้งหมด
-- (ไม่นับช่วงราคาอื่นที่บังเอิญเริ่ม 01/07 เหมือนกัน เช่นของ package ที่ยังใช้ราคานั้นอยู่จริง)
IF EXISTS (SELECT 1 FROM package_price_periods WHERE note = N'ราคาเดือน ก.ค. 2569' AND is_active = 1)
  THROW 50000, 'พบราคาเดือน ก.ค. ที่เป็น active — ต้องเป็น inactive ทั้งหมด', 1;
