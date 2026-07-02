-- 052: Align existing install_checklist_doc_no with the lead's quotation_doc_no.
-- User spec: install handover doc should share the same running number as the
-- quotation, just with a different prefix (QT-260694 -> SSE-CK-260694) so it
-- is obvious at a glance the two docs belong to the same lead.
--
-- The new mintFromQuotation() path will produce paired numbers for any future
-- mints. This migration backfills the existing leads where the install_checklist
-- counter currently differs from the quotation counter.
--
-- Idempotent: skips leads where the two already match, and skips leads with no
-- quotation_doc_no (the install mint will fall back to a fresh sequence in
-- that case).

UPDATE l
SET install_checklist_doc_no = CONCAT('SSE-CK-', SUBSTRING(l.quotation_doc_no, 4, 20)),
    updated_at = GETDATE()
FROM dbo.leads l
WHERE l.quotation_doc_no IS NOT NULL
  AND l.quotation_doc_no LIKE 'QT-%'
  AND l.install_checklist_doc_no IS NOT NULL
  AND l.install_checklist_doc_no <> CONCAT('SSE-CK-', SUBSTRING(l.quotation_doc_no, 4, 20));
GO
