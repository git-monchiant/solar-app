-- ====================================
-- Solar Sales App - Database Setup
-- SQL Server
-- ====================================

USE solardb;
GO

-- ====================================
-- 2. ตาราง users (พนักงานขาย)
-- ====================================
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    team NVARCHAR(50) NOT NULL,           -- 'Sen X PM' | 'Smartify'
    role NVARCHAR(20) NOT NULL DEFAULT 'sales', -- 'sales' | 'admin'
    phone NVARCHAR(20),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- ====================================
-- 3. ตาราง projects (โครงการ/หมู่บ้าน preset)
-- ====================================
CREATE TABLE projects (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,          -- เช่น 'เสนา วิลล์ - คลอง 1'
    location NVARCHAR(500),               -- ที่อยู่/ตำแหน่ง
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- ====================================
-- 4. ตาราง packages (แพ็คเกจสินค้า)
-- ====================================
CREATE TABLE packages (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,          -- เช่น '3 kWp', '7 kWp 1 เฟส + Battery'
    kwp DECIMAL(5,1) NOT NULL,            -- 3, 5, 7, 10
    phase INT NOT NULL DEFAULT 1,          -- 1 หรือ 3
    has_battery BIT NOT NULL DEFAULT 0,
    battery_kwh DECIMAL(5,1),             -- 9.6
    battery_brand NVARCHAR(50),           -- 'ZTT'
    solar_panels INT,                      -- จำนวนแผง
    panel_watt INT,                        -- วัตต์ต่อแผง เช่น 575
    inverter_kw DECIMAL(5,1),             -- ขนาด inverter
    inverter_brand NVARCHAR(50),          -- 'Huawei'
    price DECIMAL(12,2) NOT NULL,         -- ราคา (รวม VAT)
    monthly_installment NVARCHAR(20),     -- ค่าผ่อน/เดือน เช่น '1,2xx'
    monthly_saving DECIMAL(10,2),         -- ประหยัดค่าไฟ/เดือน
    warranty_years INT DEFAULT 10,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- ====================================
-- 5. ตาราง leads (ลีดลูกค้า)
-- ====================================
CREATE TABLE leads (
    id INT IDENTITY(1,1) PRIMARY KEY,
    full_name NVARCHAR(200) NOT NULL,
    phone NVARCHAR(20),
    project_id INT FOREIGN KEY REFERENCES projects(id),
    house_number NVARCHAR(50),
    customer_type NVARCHAR(50),           -- 'ลูกค้าใหม่ยังไม่มีโซล่า' | 'ลูกค้านอกโครงการ'
    interested_package_id INT FOREIGN KEY REFERENCES packages(id),
    status NVARCHAR(30) NOT NULL DEFAULT N'ลีดใหม่',
    -- สถานะ: ลีดใหม่ → นัดสำรวจ → เสนอราคา → ตัดสินใจซื้อ → ชำระเงิน → ติดตั้ง
    note NVARCHAR(MAX),
    photo_url NVARCHAR(500),              -- รูปถ่ายจากกล้อง (บัตร/กระดาษ)
    assigned_user_id INT FOREIGN KEY REFERENCES users(id),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- ====================================
-- 6. ตาราง bookings (ใบจอง)
-- ====================================
CREATE TABLE bookings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    booking_number NVARCHAR(20) NOT NULL UNIQUE,  -- SM-26001
    lead_id INT NOT NULL FOREIGN KEY REFERENCES leads(id),
    package_id INT NOT NULL FOREIGN KEY REFERENCES packages(id),
    total_price DECIMAL(12,2) NOT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT N'รอชำระ',
    -- สถานะ: รอชำระ → ชำระแล้ว → กำลังติดตั้ง → เสร็จสิ้น
    note NVARCHAR(MAX),
    created_by INT FOREIGN KEY REFERENCES users(id),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- ====================================
-- 7. Indexes
-- ====================================
CREATE INDEX IX_leads_status ON leads(status);
CREATE INDEX IX_leads_project ON leads(project_id);
CREATE INDEX IX_leads_assigned ON leads(assigned_user_id);
CREATE INDEX IX_bookings_number ON bookings(booking_number);
CREATE INDEX IX_bookings_lead ON bookings(lead_id);

PRINT 'Database and tables created successfully!';
GO
