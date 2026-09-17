-- เติมข้อมูลจาก REM API (ระบบขาย authoritative) ลง om_installations
-- chain: customer_id_enc → MyUnit(เช็ค house_no) → contract_id → MyUnitDetail/TransferInfo/BookingInfo
IF COL_LENGTH('dbo.om_installations', 'rem_contract_id') IS NULL
  ALTER TABLE dbo.om_installations ADD rem_contract_id NVARCHAR(40) COLLATE Latin1_General_BIN2 NULL;
GO
IF COL_LENGTH('dbo.om_installations', 'rem_contract_status') IS NULL
  ALTER TABLE dbo.om_installations ADD rem_contract_status NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.om_installations', 'rem_size_kwp') IS NULL
  ALTER TABLE dbo.om_installations ADD rem_size_kwp DECIMAL(6,2) NULL;   -- ขนาดติดตั้ง solar จาก BookingInfo
GO
IF COL_LENGTH('dbo.om_installations', 'rem_transfer_date') IS NULL
  ALTER TABLE dbo.om_installations ADD rem_transfer_date DATE NULL;      -- วันโอน authoritative (TransferInfo)
GO
IF COL_LENGTH('dbo.om_installations', 'rem_checked_at') IS NULL
  ALTER TABLE dbo.om_installations ADD rem_checked_at DATETIMEOFFSET NULL;
GO
