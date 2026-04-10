USE solardb;
GO

-- Seed leads จากข้อมูล spreadsheet

-- Lead 1: เขมิดา มัณยามนท์ (SM-26001)
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'เขมิดา มัณยามนท์', N'0824883199',
  (SELECT id FROM projects WHERE name = N'เสนา วีราชิณเมศร์ - บางบัวทอง'),
  N'311/77', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  N'ตัดสินใจซื้อ', N'ชำระเงินแล้ว');

-- Lead 2: เสรี นามชร
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'เสรี นามชร', N'0948949191',
  (SELECT id FROM projects WHERE name = N'เสนา วิลล์ - คลอง 1'),
  N'4/141', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  N'เสนอราคา', N'ลูกค้าขอดึงตัวคอกก่อน');

-- Lead 3: สิตรัตน์ วงษา
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'สิตรัตน์ วงษา', N'0852245422',
  NULL,
  N'98/60', N'ลูกค้านอกโครงการ',
  (SELECT id FROM packages WHERE name = N'5 kWp'),
  N'เสนอราคา', NULL);

-- Lead 4: สรณเรจ พูลสวัสด์
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'สรณเรจ พูลสวัสด์', N'0813098527',
  (SELECT id FROM projects WHERE name = N'J Town จังหิล - คลอง 1'),
  N'5/101', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  N'เสนอราคา', N'ลูกค้าขอดึงตัวคอกก่อน');

-- Lead 5: นิธิรัตน์ เสมสันทัด
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'นิธิรัตน์ เสมสันทัด', N'0809813232',
  (SELECT id FROM projects WHERE name = N'เสนา วิลเลจ กม.9'),
  N'49/239', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  (SELECT id FROM packages WHERE name = N'5 kWp'),
  N'นัดสำรวจ', N'ขอเร่งติดตั้งภายใน พ.ย.');

-- Lead 6: อัมพร (เสนา วิลล์ - คลอง 1)
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'อัมพร', N'0805136445',
  (SELECT id FROM projects WHERE name = N'เสนา วิลล์ - คลอง 1'),
  N'4/83', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  NULL,
  N'ลีดใหม่', NULL);

-- Lead 7: กาญจนา ไวน์เทจ
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'กาญจนา ไวน์เทจ', N'0853330323',
  (SELECT id FROM projects WHERE name = N'J City เสนา'),
  N'99/479', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  NULL,
  N'ลีดใหม่', NULL);

-- Lead 8: จุฬีพัฒ
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'จุฬีพัฒ', N'0953520168',
  NULL,
  N'99/175', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  NULL,
  N'ลีดใหม่', N'ต้องการติดตั้งระบบ Upgrade/Battery');

-- Lead 9: กมลมาศ อาจป้อง
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'กมลมาศ อาจป้อง', N'0953520168',
  NULL,
  N'99/175', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  N'ลีดใหม่', N'ต้องการติดตั้ง 3 kWp ราคา 1,200-1,500 บาทต่อเดือน');

-- Lead 10: กมลเกื้อ กัญญา
INSERT INTO leads (full_name, phone, project_id, house_number, customer_type, interested_package_id, status, note)
VALUES (N'กมลเกื้อ กัญญา', NULL,
  (SELECT id FROM projects WHERE name = N'J Villa เสนา - คลอง 1'),
  N'9/120', N'ลูกค้าใหม่ยังไม่มีโซล่า',
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  N'ลีดใหม่', NULL);

-- สร้างใบจอง SM-26001 สำหรับเขมิดา
INSERT INTO bookings (booking_number, lead_id, package_id, total_price, status, note)
VALUES (N'SM-26001',
  (SELECT id FROM leads WHERE full_name = N'เขมิดา มัณยามนท์'),
  (SELECT id FROM packages WHERE name = N'3 kWp'),
  95000, N'ชำระแล้ว', N'ชำระเงินเรียบร้อย');

PRINT 'Lead and booking seed data inserted successfully!';
GO
