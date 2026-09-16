-- รวมตารางที่ทำเรื่องเดียวกัน + เปิดของเดิมให้ใช้ซ้ำ แทนการสร้างตารางใหม่
-- ★ ผู้ใช้สั่ง 10 ก.ย. 69: "อันไหนรวมได้รวมกันก่อน table ไหนใช้ร่วมกันได้ให้ใช้ร่วมกัน อย่าสร้างเยอะเกินไป"
-- อ้างอิงแนวจากระบบขายในฐานเดียวกัน: dbo.calendar_blocks (บล็อกปฏิทินตัวเดียวคุมทั้งทีมและวันหยุด)
--                                    dbo.install_checklists (ใบตรวจรับงาน 1 แถวต่อ 1 งาน เก็บผลเป็น JSON)

-- ── 1) วันที่ทำงานไม่ได้ — เดิมแยกเป็น om_holidays กับ om_team_offdays (ว่างทั้งคู่) ──
IF OBJECT_ID('dbo.om_calendar_blocks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_calendar_blocks (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    kind        NVARCHAR(16) COLLATE Latin1_General_BIN2 NOT NULL,  -- holiday | team_off | center_off
    block_date  DATE NOT NULL,
    end_date    DATE NULL,                     -- ว่าง = วันเดียว
    title       NVARCHAR(120) NOT NULL,
    team_id     INT NULL REFERENCES dbo.om_teams(id),
    center_id   INT NULL REFERENCES dbo.om_service_centers(id),
    time_slot   NVARCHAR(60) NULL,             -- ว่าง = ทั้งวัน
    note        NVARCHAR(300) NULL,
    created_by  INT NULL,
    created_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE INDEX IX_om_calendar_blocks_date ON dbo.om_calendar_blocks (block_date);
END
GO
IF OBJECT_ID('dbo.om_holidays', 'U') IS NOT NULL DROP TABLE dbo.om_holidays;
IF OBJECT_ID('dbo.om_team_offdays', 'U') IS NOT NULL DROP TABLE dbo.om_team_offdays;
GO

-- ── 2) FAQ — om_faq.category เก็บชื่อหมวดเป็นข้อความอยู่แล้ว ตารางหมวดมีไว้แค่บอกลำดับ ──
IF COL_LENGTH('om_faq', 'category_sort') IS NULL
  ALTER TABLE dbo.om_faq ADD category_sort INT NOT NULL CONSTRAINT DF_om_faq_catsort DEFAULT 100;
GO
UPDATE f SET f.category_sort = c.sort_order
FROM dbo.om_faq f JOIN dbo.om_faq_categories c ON c.name = f.category;
GO
IF OBJECT_ID('dbo.om_faq_categories', 'U') IS NOT NULL DROP TABLE dbo.om_faq_categories;
GO

-- ── 3) ประวัติงานบริการ — ให้บันทึกการโทรได้ตั้งแต่ยังไม่มีใบงาน (แทนตาราง om_call_log ที่จะสร้าง) ──
--    การ์ด "ติดตาม" คำนวณสด ยังไม่มีแถวใน om_bookings ⇒ log ต้องผูกกับบ้านได้ด้วย
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.om_booking_history;'
FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID('dbo.om_booking_history') AND c.name = 'booking_id' AND i.is_primary_key = 0;
IF @sql <> N'' EXEC sp_executesql @sql;
GO
DECLARE @fk NVARCHAR(200) = (SELECT TOP 1 name FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID('dbo.om_booking_history'));
IF @fk IS NOT NULL EXEC('ALTER TABLE dbo.om_booking_history DROP CONSTRAINT ' + @fk);
GO
ALTER TABLE dbo.om_booking_history ALTER COLUMN booking_id INT NULL;
GO
IF COL_LENGTH('om_booking_history', 'house_id') IS NULL
  ALTER TABLE dbo.om_booking_history ADD house_id INT NULL REFERENCES dbo.om_houses(id);
IF COL_LENGTH('om_booking_history', 'next_action_date') IS NULL
  ALTER TABLE dbo.om_booking_history ADD next_action_date DATE NULL;   -- นัดโทรใหม่
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_booking_history_booking')
  CREATE INDEX IX_om_booking_history_booking ON dbo.om_booking_history (booking_id) WHERE booking_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_booking_history_house')
  CREATE INDEX IX_om_booking_history_house ON dbo.om_booking_history (house_id, created_at) WHERE house_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_om_booking_history_booking')
  ALTER TABLE dbo.om_booking_history ADD CONSTRAINT FK_om_booking_history_booking
    FOREIGN KEY (booking_id) REFERENCES dbo.om_bookings(id);
GO

-- ── 4) เบอร์โทร — มีสถานะในตัว ไม่ต้องมีตาราง om_phone_history แยก (ประวัติลง om_customer_history) ──
IF COL_LENGTH('om_customer_phones', 'status') IS NULL
  ALTER TABLE dbo.om_customer_phones ADD status NVARCHAR(12) COLLATE Latin1_General_BIN2
    NOT NULL CONSTRAINT DF_om_customer_phones_status DEFAULT 'active';   -- active | backup | invalid
GO

-- ── 5) OTP — ทำให้เป็นตารางกลาง ใช้ได้ทั้งยืนยันตัวตนและปิดงานหน้างาน (กันสร้างตารางที่สอง) ──
IF COL_LENGTH('om_otp_requests', 'purpose') IS NULL
  ALTER TABLE dbo.om_otp_requests ADD purpose NVARCHAR(20) COLLATE Latin1_General_BIN2
    NOT NULL CONSTRAINT DF_om_otp_purpose DEFAULT 'identity';   -- identity | job_close
IF COL_LENGTH('om_otp_requests', 'ref_id') IS NULL
  ALTER TABLE dbo.om_otp_requests ADD ref_id INT NULL;          -- เช่น booking_id ตอนปิดงาน
GO
