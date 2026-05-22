-- Add column for storing per-panel serial numbers as a JSON array of strings.
-- Stored shape: '["SN001","SN002",...]' (max 20 entries enforced by UI).
-- Distinct from the existing warranty_panel_serials_url (which holds a URL
-- to a scanned document — that field stays for backwards compat).
--
-- Idempotent: COL_LENGTH guard skips ADD if column already exists.
IF COL_LENGTH('dbo.leads', 'warranty_panel_serials') IS NULL
BEGIN
  ALTER TABLE dbo.leads ADD warranty_panel_serials NVARCHAR(MAX) NULL;
END;
GO
