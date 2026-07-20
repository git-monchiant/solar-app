-- Photos added after the warranty step is complete. Stored as a JSON object
-- keyed by inverters, panels, and batteries. These are operational evidence
-- only: warranty PDF generation must not read or append this field.
IF NOT EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads')
    AND name = 'warranty_evidence_photos'
)
  ALTER TABLE dbo.leads ADD warranty_evidence_photos NVARCHAR(MAX) NULL;
GO
