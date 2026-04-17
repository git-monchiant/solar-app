USE solardb;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='prospects' AND xtype='U')
BEGIN
  CREATE TABLE prospects (
    id INT IDENTITY(1,1) PRIMARY KEY,
    project_id INT NULL FOREIGN KEY REFERENCES projects(id),
    seq INT NULL,                            -- ลำดับจากไฟล์ต้นทาง
    house_number NVARCHAR(50) NULL,          -- แปลง / บ้านเลขที่
    full_name NVARCHAR(200) NULL,            -- ชื่อ-นามสกุล สมาชิก
    phone NVARCHAR(20) NULL,                 -- เบอร์ติดต่อ
    app_status NVARCHAR(50) NULL,            -- สถานะการใช้งาน App Sen Prop
    existing_solar NVARCHAR(50) NULL,        -- สถานะ Solar เดิม
    installed_kw DECIMAL(8,2) NULL,          -- ขนาดติดตั้ง (KW)
    installed_product NVARCHAR(200) NULL,    -- ผลิตภัณฑ์ที่ติดตั้ง
    ev_charger NVARCHAR(100) NULL,           -- EV Charger
    interest NVARCHAR(20) NULL,              -- 'interested' | 'not_interested' | 'not_home' | NULL
    note NVARCHAR(MAX) NULL,
    visited_by INT NULL FOREIGN KEY REFERENCES users(id),
    visited_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );

  CREATE INDEX IX_prospects_project ON prospects(project_id);
  CREATE INDEX IX_prospects_interest ON prospects(interest);
END
GO
