USE solardb;
GO

-- เพิ่มโครงการที่ยังไม่มี
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'เสนา วิว่า รัตนาธิเบศร์ - บางบัวทอง')
  INSERT INTO projects (name) VALUES (N'เสนา วิว่า รัตนาธิเบศร์ - บางบัวทอง');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'เสนา เวล่า รังสิต - คลอง 1')
  INSERT INTO projects (name) VALUES (N'เสนา เวล่า รังสิต - คลอง 1');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'J City สุขุมวิท - แพรกษา')
  INSERT INTO projects (name) VALUES (N'J City สุขุมวิท - แพรกษา');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา')
  INSERT INTO projects (name) VALUES (N'เสนา วิลเลจ สุขุมวิท - แพรกษา');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'เสนา อเวนิว 2 รังสิต - คลอง 1')
  INSERT INTO projects (name) VALUES (N'เสนา อเวนิว 2 รังสิต - คลอง 1');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'J Town1 รังสิต - คลอง 1')
  INSERT INTO projects (name) VALUES (N'J Town1 รังสิต - คลอง 1');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'J Town2 รังสิต - คลอง 1')
  INSERT INTO projects (name) VALUES (N'J Town2 รังสิต - คลอง 1');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'J Villa รังสิต - คลอง 1')
  INSERT INTO projects (name) VALUES (N'J Villa รังสิต - คลอง 1');
IF NOT EXISTS (SELECT 1 FROM projects WHERE name = N'J Exclusive รังสิต - คลอง 1')
  INSERT INTO projects (name) VALUES (N'J Exclusive รังสิต - คลอง 1');
GO

-- Insert leads จาก Google Sheet จริง
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note, contact_date, payment_method, last_contact_result, next_follow_up)
VALUES
-- 1. คุณเชนิสา มัณยานนท์
(N'คุณเชนิสา มัณยานนท์', N'082-488-3199', (SELECT id FROM projects WHERE name = N'เสนา วิว่า รัตนาธิเบศร์ - บางบัวทอง'), N'311/77', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'3 kWp'), N'ตัดสินใจซื้อ', N'ชำระเงินแล้ว รอนัดติดตั้ง', '2026-04-03', N'ชำระทั้งหมด (โอน)', N'รอวันนัดติดตั้ง', NULL),

-- 2. ชลินทร์
(N'ชลินทร์', N'0896136445', (SELECT id FROM projects WHERE name = N'เสนา เวล่า รังสิต - คลอง 1'), N'4/83', N'ลูกค้าใหม่ยังไม่มีโซล่า', NULL, N'ลีดใหม่', N'ขอข้อมูลเพื่อพิจารณาก่อน', '2026-04-05', NULL, NULL, NULL),

-- 3. จิราภรณ์ มั่นสวัสดิ์
(N'จิราภรณ์ มั่นสวัสดิ์', N'0805938202', (SELECT id FROM projects WHERE name = N'J City สุขุมวิท - แพรกษา'), N'994/79', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'7 kWp 1 เฟส + Battery'), N'ลีดใหม่', N'จัดไฟแนนท์ได้ / พื้นที่หลังคาไม่พอ 7kW', '2026-04-06', NULL, NULL, '2026-04-09'),

-- 4. ฤทธิวัตร์
(N'ฤทธิวัตร์', N'0636396953', (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา'), N'995/219', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'7 kWp 1 เฟส + Battery'), N'ลีดใหม่', N'จัดไฟแนนท์ได้ / อยู่ระหว่างสำรวจพื้นที่', '2026-04-06', NULL, NULL, NULL),

-- 5. นายกมล อาชนันท์
(N'นายกมล อาชนันท์', N'0955326166', (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา'), N'995/175', N'ลูกค้าเดิมต้องการ Upgrade/Battery', NULL, N'ลีดใหม่', N'ขอแพคเกจอัพเกรดเพิ่มจาก 3 kWp ต้องการต่อเพิ่มอีกจุดเพื่อชาร์ทรถไฟฟ้า', '2026-04-06', NULL, NULL, NULL),

-- 6. นายสมพงษ์ อุ่นคงพะเนา
(N'นายสมพงษ์ อุ่นคงพะเนา', N'0990913437', (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา'), N'995/244', N'ลูกค้าเดิมต้องการ Upgrade/Battery', NULL, N'ลีดใหม่', N'ขอแพคเกจอัพเกรดเพิ่มจาก 3 kWp ค่าไฟ ~ 1,200-1,500 บาท/เดือน', '2026-04-06', NULL, NULL, NULL),

-- 7. นายวิริยะ นุชถาวร
(N'นายวิริยะ นุชถาวร', N'0814072839', (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา'), N'995/82', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'7 kWp 1 เฟส + Battery'), N'ลีดใหม่', N'บ้านแฝด อาจใช้รถไฟฟ้าในอนาคต ขอปรึกษาภรรยาก่อน', '2026-04-06', NULL, NULL, NULL),

-- 8. ฉรัณย์ฉัตร บางัดสาเระ
(N'ฉรัณย์ฉัตร บางัดสาเระ', N'0822662674', (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา'), N'995/107', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'5 kWp'), N'ลีดใหม่', NULL, '2026-04-06', NULL, NULL, NULL),

-- 9. นายแพทย์ธีรัชชา วุฒิพันธุ์
(N'นพ.ธีรัชชา วุฒิพันธุ์', N'0836624554', (SELECT id FROM projects WHERE name = N'เสนา อเวนิว 2 รังสิต - คลอง 1'), N'1/1', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'5 kWp'), N'เสนอราคา', N'ขอใบเสนอราคา 5 kWp+2 แผง ขอติดตั้งหลังสงกรานต์', '2026-04-05', NULL, NULL, NULL),

-- 10. นายเสรี นามศรี
(N'นายเสรี นามศรี', N'094-894-9191', (SELECT id FROM projects WHERE name = N'เสนา เวล่า รังสิต - คลอง 1'), N'4/141', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'5 kWp'), N'เสนอราคา', N'ขอใบเสนอราคา 5/3 kW ขอพิจารณาเรื่องการชำระเงินก่อน', '2026-04-05', NULL, NULL, NULL),

-- 11. นายคาวี แก้วพวง
(N'นายคาวี แก้วพวง', N'0824670066', (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ สุขุมวิท - แพรกษา'), N'995/80', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'7 kWp 1 เฟส + Battery'), N'ลีดใหม่', N'สนใจแบบมีแบต ติดต่อกลับเพื่ออธิบายเพิ่มเติม', '2026-04-06', NULL, NULL, NULL),

-- 12. คุณลำไย บุญชิค
(N'คุณลำไย บุญชิค', N'0612682815', (SELECT id FROM projects WHERE name = N'J Town1 รังสิต - คลอง 1'), N'7/232', N'ลูกค้าใหม่ยังไม่มีโซล่า', NULL, N'ลีดใหม่', NULL, '2026-04-05', NULL, NULL, NULL),

-- 13. คุณเจมส์
(N'คุณเจมส์', N'0991128189', (SELECT id FROM projects WHERE name = N'J Town2 รังสิต - คลอง 1'), N'9/120', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'3 kWp'), N'ลีดใหม่', NULL, '2026-04-05', NULL, NULL, NULL),

-- 14. คุณผึ้ง
(N'คุณผึ้ง', N'0846530321', (SELECT id FROM projects WHERE name = N'J Villa รังสิต - คลอง 1'), N'5/129', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'5 kWp'), N'ลีดใหม่', NULL, '2026-04-05', NULL, NULL, NULL),

-- 15. คุณเก่ง กิตติ
(N'คุณเก่ง กิตติ', N'0945517108', (SELECT id FROM projects WHERE name = N'J Exclusive รังสิต - คลอง 1'), N'9/93', N'ลูกค้าใหม่ยังไม่มีโซล่า', NULL, N'ลีดใหม่', N'รอคุยกับลูกชายก่อน', '2026-04-05', NULL, NULL, NULL),

-- 16. คุณป็อป
(N'คุณป็อป', N'0909591479', (SELECT id FROM projects WHERE name = N'J Exclusive รังสิต - คลอง 1'), N'9/73', N'ลูกค้าใหม่ยังไม่มีโซล่า', NULL, N'ลีดใหม่', NULL, '2026-04-05', NULL, NULL, NULL),

-- 17. คุณดิว
(N'คุณดิว', N'0885137576', (SELECT id FROM projects WHERE name = N'J Town1 รังสิต - คลอง 1'), N'7/169', N'ลูกค้าใหม่ยังไม่มีโซล่า', (SELECT id FROM packages WHERE name = N'7 kWp 1 เฟส + Battery'), N'ลีดใหม่', N'ลูกค้าสะดวกให้ติดต่อกลับวันพุธที่ 8/04 สนใจ Home Equity ธ.ออมสิน', '2026-04-05', NULL, NULL, '2026-04-08');

-- สร้างใบจอง สำหรับคุณเชนิสา
INSERT INTO bookings (booking_number, lead_id, package_id, total_price, status, note)
VALUES (N'SM-26001',
  (SELECT id FROM leads WHERE full_name = N'คุณเชนิสา มัณยานนท์'),
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  95000, N'ชำระแล้ว', N'ชำระทั้งหมด (โอน) รอนัดติดตั้ง');

PRINT 'Real data seeded successfully!';
GO
