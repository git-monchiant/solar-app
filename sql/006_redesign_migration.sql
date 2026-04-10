USE solardb;
GO

-- 1. Add new columns to leads
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'source')
  ALTER TABLE leads ADD source NVARCHAR(30) DEFAULT 'walk-in';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'revisit_date')
  ALTER TABLE leads ADD revisit_date DATE;

-- lost_reason already exists from earlier migration, check first
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'lost_reason')
  ALTER TABLE leads ADD lost_reason NVARCHAR(MAX);

GO

-- 2. Update statuses from Thai to English
UPDATE leads SET status = 'new' WHERE status = N'ลีดใหม่';
UPDATE leads SET status = 'contacted' WHERE status = N'นัดสำรวจ';
UPDATE leads SET status = 'quoted' WHERE status = N'เสนอราคา';
UPDATE leads SET status = 'negotiation' WHERE status = N'ตัดสินใจซื้อ';
UPDATE leads SET status = 'won' WHERE status = N'ชำระเงิน';
UPDATE leads SET status = 'won' WHERE status = N'ติดตั้ง';

-- Update default
ALTER TABLE leads ADD CONSTRAINT DF_leads_status_new DEFAULT 'new' FOR status;
GO

-- 3. Update activity old/new status references
UPDATE lead_activities SET old_status = 'new' WHERE old_status = N'ลีดใหม่';
UPDATE lead_activities SET old_status = 'contacted' WHERE old_status = N'นัดสำรวจ';
UPDATE lead_activities SET old_status = 'quoted' WHERE old_status = N'เสนอราคา';
UPDATE lead_activities SET old_status = 'negotiation' WHERE old_status = N'ตัดสินใจซื้อ';
UPDATE lead_activities SET old_status = 'won' WHERE old_status = N'ชำระเงิน';
UPDATE lead_activities SET old_status = 'won' WHERE old_status = N'ติดตั้ง';

UPDATE lead_activities SET new_status = 'new' WHERE new_status = N'ลีดใหม่';
UPDATE lead_activities SET new_status = 'contacted' WHERE new_status = N'นัดสำรวจ';
UPDATE lead_activities SET new_status = 'quoted' WHERE new_status = N'เสนอราคา';
UPDATE lead_activities SET new_status = 'negotiation' WHERE new_status = N'ตัดสินใจซื้อ';
UPDATE lead_activities SET new_status = 'won' WHERE new_status = N'ชำระเงิน';
UPDATE lead_activities SET new_status = 'won' WHERE new_status = N'ติดตั้ง';

-- 4. Set source for existing leads
UPDATE leads SET source = 'walk-in' WHERE source IS NULL;

PRINT 'Migration complete!';
GO
