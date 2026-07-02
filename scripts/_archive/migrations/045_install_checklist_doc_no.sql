-- install_checklist_doc_no on the leads table.
-- mintDocNo writes to a column on `leads`; mirroring that pattern for the
-- new install_checklist doc type keeps the mint logic generic. The
-- install_checklists.doc_no column from migration 044 becomes redundant
-- (leads is the single source of truth for every document number) — drop
-- it so the two columns can't diverge.

IF COL_LENGTH('dbo.leads', 'install_checklist_doc_no') IS NULL
  ALTER TABLE dbo.leads ADD install_checklist_doc_no NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.install_checklists', 'doc_no') IS NOT NULL
  ALTER TABLE dbo.install_checklists DROP COLUMN doc_no;
GO
