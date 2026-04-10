USE solardb;
GO

-- 1. Add new fields
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'payment_type')
  ALTER TABLE leads ADD payment_type NVARCHAR(30);
-- values: 'cash' | 'home_equity' | 'finance'

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'finance_status')
  ALTER TABLE leads ADD finance_status NVARCHAR(30);
-- values: 'pending' | 'approved' | 'rejected'

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'requirement')
  ALTER TABLE leads ADD requirement NVARCHAR(MAX);

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'assigned_staff')
BEGIN
  -- might already exist from earlier migration
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'assigned_staff')
    ALTER TABLE leads ADD assigned_staff NVARCHAR(100);
END

GO

-- 2. Remove negotiation status → move to quoted
UPDATE leads SET status = 'quoted' WHERE status = 'negotiation';
UPDATE lead_activities SET old_status = 'quoted' WHERE old_status = 'negotiation';
UPDATE lead_activities SET new_status = 'quoted' WHERE new_status = 'negotiation';

-- 3. Set payment_type for existing data
UPDATE leads SET payment_type = 'cash' WHERE payment_method = N'ชำระทั้งหมด (โอน)';

-- 4. Set requirement from note for leads with specific requirements
UPDATE leads SET requirement = N'ขอแพคเกจอัพเกรดเพิ่มจาก 3 kWp ต้องการต่อเพิ่มอีกจุดเพื่อชาร์ทรถไฟฟ้า'
  WHERE full_name = N'นายกมล อาชนันท์';
UPDATE leads SET requirement = N'ขอแพคเกจอัพเกรดเพิ่มจาก 3 kWp ค่าไฟ ~ 1,200-1,500 บาท/เดือน'
  WHERE full_name = N'นายสมพงษ์ อุ่นคงพะเนา';
UPDATE leads SET requirement = N'สนใจ Home Equity ธ.ออมสิน', payment_type = 'home_equity'
  WHERE full_name = N'คุณดิว';
UPDATE leads SET requirement = N'จัดไฟแนนท์ได้', payment_type = 'finance'
  WHERE full_name = N'จิราภรณ์ มั่นสวัสดิ์';
UPDATE leads SET requirement = N'จัดไฟแนนท์ได้', payment_type = 'finance'
  WHERE full_name = N'ฤทธิวัตร์';

PRINT 'Payment fields migration complete!';
GO
