USE solardb;
GO

-- ====================================
-- Seed: packages (จาก senasolarenergy.com)
-- ====================================

-- ไม่มี Battery
INSERT INTO packages (name, kwp, phase, has_battery, solar_panels, panel_watt, inverter_kw, inverter_brand, price, monthly_installment, monthly_saving, warranty_years)
VALUES
(N'3 kWp', 3, 1, 0, 6, 575, 3, 'Huawei', 95000, N'1,2xx', 1800, 10),
(N'5 kWp', 5, 1, 0, 9, 575, 5, 'Huawei', 127000, N'1,5xx', 3000, 10),
(N'10 kWp', 10, 1, 0, 18, 575, 10, 'Huawei', 219000, N'2,6xx', 6000, 10);

-- มี Battery
INSERT INTO packages (name, kwp, phase, has_battery, battery_kwh, battery_brand, price, monthly_installment, warranty_years)
VALUES
(N'7 kWp 1 เฟส + Battery', 7, 1, 1, 9.6, 'ZTT', 273000, N'3,2xx', 10),
(N'7 kWp 3 เฟส + Battery', 7, 3, 1, 9.6, 'ZTT', 300000, N'3,5xx', 10),
(N'10 kWp 1 เฟส + Battery', 10, 1, 1, 9.6, 'ZTT', 355000, N'4,2xx', 10),
(N'10 kWp 3 เฟส + Battery', 10, 3, 1, 9.6, 'ZTT', 371000, N'4,4xx', 10);

-- ====================================
-- Seed: projects (โครงการจาก spreadsheet)
-- ====================================
INSERT INTO projects (name)
VALUES
(N'เสนา วิลล์ - คลอง 1'),
(N'J City เสนา'),
(N'J Villa เสนา - คลอง 1'),
(N'J Town จังหิล - คลอง 1'),
(N'Exclusive วิลล์'),
(N'เสนา วีราชิณเมศร์ - บางบัวทอง'),
(N'เสนา วิลเลจ กม.9');

-- ====================================
-- Seed: default admin user
-- ====================================
INSERT INTO users (username, password_hash, full_name, team, role)
VALUES
(N'admin', N'$temp_hash$', N'Admin', N'Sen X PM', N'admin');

PRINT 'Seed data inserted successfully!';
GO
