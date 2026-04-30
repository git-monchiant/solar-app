-- Add lead fields to mirror Solar Sales Lead Database (Google Sheet).
-- Existing equivalents reused: contact_date (col 17), home_equity_check (col 48),
-- last_contact_result (col 42), requirement (col 19), pre_note (col 24),
-- pre_total_price (col 28), pre_doc_no (col 29), pre_booked_at (col 30).

-- 1. รหัสลูกค้า (SL00001)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'customer_code')
  ALTER TABLE dbo.leads ADD customer_code NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_leads_customer_code')
  CREATE UNIQUE INDEX UX_leads_customer_code ON dbo.leads(customer_code) WHERE customer_code IS NOT NULL;
GO

-- 2. หมายเหตุโครงการ (col 12)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'project_note')
  ALTER TABLE dbo.leads ADD project_note NVARCHAR(500) NULL;
GO

-- 3. ความสนใจของลูกค้า (col 15) — initial expressed interest, distinct from requirement
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'customer_interest')
  ALTER TABLE dbo.leads ADD customer_interest NVARCHAR(500) NULL;
GO

-- 4. Lead Seeker Type (col 14) + ชื่อ-สกุล Lead Seeker (col 16)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'seeker_type')
  ALTER TABLE dbo.leads ADD seeker_type NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'seeker_name')
  ALTER TABLE dbo.leads ADD seeker_name NVARCHAR(200) NULL;
GO

-- 5. บ้านปลอดภาระ / ยังผ่อน bank (col 22)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'home_loan_status')
  ALTER TABLE dbo.leads ADD home_loan_status NVARCHAR(50) NULL;
GO

-- 6. วันที่เข้าสำรวจจริง (col 33) — separate from survey_date (appointment)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_actual_date')
  ALTER TABLE dbo.leads ADD survey_actual_date DATE NULL;
GO

-- 7. ผู้เข้าสำรวจ (col 35)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_actual_by')
  ALTER TABLE dbo.leads ADD survey_actual_by NVARCHAR(200) NULL;
GO

-- 8. ผู้จัดทำใบเสนอราคา (col 37)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'quotation_by')
  ALTER TABLE dbo.leads ADD quotation_by NVARCHAR(200) NULL;
GO

-- 9. เลขที่ใบเสนอราคา (col 39)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'quotation_doc_no')
  ALTER TABLE dbo.leads ADD quotation_doc_no NVARCHAR(30) NULL;
GO

-- 10. วันที่ส่งใบเสนอราคา (col 40)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'quotation_sent_date')
  ALTER TABLE dbo.leads ADD quotation_sent_date DATE NULL;
GO

-- 11–13. สินเชื่อ (cols 45–47): bank / months / monthly
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'finance_bank')
  ALTER TABLE dbo.leads ADD finance_bank NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'finance_months')
  ALTER TABLE dbo.leads ADD finance_months INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'finance_monthly')
  ALTER TABLE dbo.leads ADD finance_monthly DECIMAL(12,2) NULL;
GO

-- 14–16. Home Equity (cols 49–52): bank / loan_amount / documents / status
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'finance_loan_bank')
  ALTER TABLE dbo.leads ADD finance_loan_bank NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'finance_loan_amount')
  ALTER TABLE dbo.leads ADD finance_loan_amount DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'finance_documents')
  ALTER TABLE dbo.leads ADD finance_documents NVARCHAR(MAX) NULL;
GO

-- 17. วันที่ติดตั้งจริง (col 55) — separate from install_date (appointment)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'install_actual_date')
  ALTER TABLE dbo.leads ADD install_actual_date DATE NULL;
GO
