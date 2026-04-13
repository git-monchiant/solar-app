-- Rename pre-survey columns to use pre_ prefix for consistency with survey_*, quote_*, etc.
USE solardb;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'monthly_bill')
  EXEC sp_rename 'leads.monthly_bill', 'pre_monthly_bill', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'electrical_phase')
  EXEC sp_rename 'leads.electrical_phase', 'pre_electrical_phase', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'wants_battery')
  EXEC sp_rename 'leads.wants_battery', 'pre_wants_battery', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'roof_shape')
  EXEC sp_rename 'leads.roof_shape', 'pre_roof_shape', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'appliances')
  EXEC sp_rename 'leads.appliances', 'pre_appliances', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'ac_units')
  EXEC sp_rename 'leads.ac_units', 'pre_ac_units', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'peak_usage')
  EXEC sp_rename 'leads.peak_usage', 'pre_peak_usage', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'bill_photo_url')
  EXEC sp_rename 'leads.bill_photo_url', 'pre_bill_photo_url', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'residence_type')
  EXEC sp_rename 'leads.residence_type', 'pre_residence_type', 'COLUMN';
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'primary_reason')
  EXEC sp_rename 'leads.primary_reason', 'pre_primary_reason', 'COLUMN';
GO

-- Survey field that was named survey_electrical_phase already has prefix; no change needed
