-- Rename every quotation number from SM-QT-YY-XXXX to SSR-QT-YY-XXXX.
-- Existing approved PDF artifacts are removed so the next view regenerates
-- the document from its updated snapshot with the new number.
-- Idempotent migration for SQL Server.

SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @affected_quotations TABLE (id INT PRIMARY KEY);

INSERT INTO @affected_quotations (id)
SELECT id
FROM dbo.quotations
WHERE doc_no LIKE 'SM-QT-%';

IF EXISTS (
  SELECT 1
  FROM dbo.quotations old_quote
  JOIN dbo.quotations new_quote
    ON new_quote.doc_no = REPLACE(old_quote.doc_no, 'SM-QT-', 'SSR-QT-')
   AND new_quote.id <> old_quote.id
  WHERE old_quote.doc_no LIKE 'SM-QT-%'
)
BEGIN
  ROLLBACK TRANSACTION;
  THROW 50001, 'Cannot migrate SM-QT quotation numbers because an SSR-QT number already exists.', 1;
END;

DELETE artifact
FROM dbo.quotation_document_artifacts artifact
JOIN @affected_quotations affected ON affected.id = artifact.quotation_id;

UPDATE dbo.quotations
SET
  doc_no = REPLACE(doc_no, 'SM-QT-', 'SSR-QT-'),
  document_snapshot_json = CASE
    WHEN document_snapshot_json LIKE '%SM-QT-%'
      THEN REPLACE(document_snapshot_json, 'SM-QT-', 'SSR-QT-')
    ELSE document_snapshot_json
  END
WHERE id IN (SELECT id FROM @affected_quotations);

UPDATE dbo.leads
SET quotation_doc_no = REPLACE(quotation_doc_no, 'SM-QT-', 'SSR-QT-')
WHERE quotation_doc_no LIKE 'SM-QT-%';

UPDATE dbo.leads
SET quotation_files = REPLACE(quotation_files, 'SM-QT-', 'SSR-QT-')
WHERE quotation_files LIKE '%SM-QT-%';

UPDATE dbo.lead_activities
SET
  title = REPLACE(title, 'SM-QT-', 'SSR-QT-'),
  note = CASE
    WHEN note LIKE '%SM-QT-%' THEN REPLACE(note, 'SM-QT-', 'SSR-QT-')
    ELSE note
  END
WHERE title LIKE '%SM-QT-%' OR note LIKE '%SM-QT-%';

UPDATE dbo.quotation_approval_events
SET note = REPLACE(note, 'SM-QT-', 'SSR-QT-')
WHERE note LIKE '%SM-QT-%';

COMMIT TRANSACTION;

