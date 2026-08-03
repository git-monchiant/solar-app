-- Keep the Settings screen and generic document-number factory aligned with
-- the fixed quotation format SSR-QT-YY-XXXX.
-- Idempotent migration for SQL Server.

MERGE dbo.app_settings AS target
USING (
  VALUES
    (N'doc_prefix_quotation', N'SSR-QT'),
    (N'doc_digits_quotation', N'4')
) AS source ([key], value)
ON target.[key] = source.[key]
WHEN MATCHED THEN
  UPDATE SET value = source.value, updated_at = GETDATE()
WHEN NOT MATCHED THEN
  INSERT ([key], value) VALUES (source.[key], source.value);

