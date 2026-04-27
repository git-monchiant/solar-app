-- One house = one prospect row. Multiple people per house go into `contacts`
-- as a JSON array, e.g. [{"name":"สมาน","phone":"0891234567"}, {"name":"มาลี","phone":null}].
-- Primary contact (index 0) mirrors the existing full_name/phone columns for
-- backward compat with list/search/map queries.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.prospects') AND name = 'contacts')
BEGIN
  ALTER TABLE dbo.prospects ADD contacts NVARCHAR(MAX) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_prospects_contacts_json')
BEGIN
  ALTER TABLE dbo.prospects ADD CONSTRAINT CK_prospects_contacts_json
    CHECK (contacts IS NULL OR ISJSON(contacts) = 1);
END;
