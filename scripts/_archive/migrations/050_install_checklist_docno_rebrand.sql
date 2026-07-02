-- 050: Rebrand install_checklist_doc_no values to the new "SSE-CK-YY####" format.
--
-- Legacy values look like "IC-26002" or "SSE-26002" (3-digit counter with no
-- second prefix segment). Convert them to "SSE-CK-26{padded4}" so existing
-- leads pick up the new format without needing a re-mint.
--
-- Idempotent: rows already in canonical form ("SSE-CK-…") are skipped.
-- Rows whose value doesn't look like a recognised legacy format are also
-- skipped (left untouched so a human can review them).

UPDATE l
SET install_checklist_doc_no = CONCAT(
    'SSE-CK-',
    SUBSTRING(l.install_checklist_doc_no, CHARINDEX('-', l.install_checklist_doc_no) + 1, 2),
    RIGHT('0000' + SUBSTRING(l.install_checklist_doc_no, CHARINDEX('-', l.install_checklist_doc_no) + 3, 10), 4)
  ),
  updated_at = GETDATE()
FROM dbo.leads l
WHERE l.install_checklist_doc_no IS NOT NULL
  AND l.install_checklist_doc_no NOT LIKE 'SSE-CK-%'
  AND (
    l.install_checklist_doc_no LIKE 'IC-%' OR
    l.install_checklist_doc_no LIKE 'SSE-2%'   -- 2 = 2-digit year (26 = 2026 ครับ)
  );
GO
