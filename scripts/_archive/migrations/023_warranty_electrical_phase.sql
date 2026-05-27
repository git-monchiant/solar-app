-- Warranty step: record actual installed phase (may differ from surveyed phase).
-- Defaults to lead.survey_electrical_phase in the UI but staff can override.
-- Idempotent: COL_LENGTH guard.
IF COL_LENGTH('leads', 'warranty_electrical_phase') IS NULL
  ALTER TABLE leads ADD warranty_electrical_phase NVARCHAR(20) NULL;
GO
