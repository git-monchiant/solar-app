-- The survey form's "มีจุดชาร์จรถ EV" checkbox is retired: Customer Info is now
-- the single place EV ownership is recorded (lead_data.appliances contains
-- 'ev'). Leads where only the surveyor ticked it would otherwise lose the
-- answer, so copy it across before the checkbox disappears.
--
-- leads.survey_appliances stays as-is (history); nothing reads it for EV after
-- this change. updated_at is left alone on existing rows — this is a data
-- move, not a new answer from the customer, and Dashboard III reads that
-- column as "questionnaire last updated".
--
-- Idempotent: rows that already contain 'ev' are skipped.

UPDATE d
SET appliances = CASE WHEN d.appliances IS NULL OR LTRIM(RTRIM(d.appliances)) = N'' THEN N'ev' ELSE d.appliances + N',ev' END
FROM dbo.lead_data d
JOIN dbo.leads l ON l.id = d.lead_id
WHERE N',' + REPLACE(ISNULL(l.survey_appliances, N''), N' ', N'') + N',' LIKE N'%,ev,%'
  AND N',' + REPLACE(ISNULL(d.appliances, N''), N' ', N'') + N',' NOT LIKE N'%,ev,%';
GO

INSERT INTO dbo.lead_data (lead_id, appliances)
SELECT l.id, N'ev'
FROM dbo.leads l
WHERE N',' + REPLACE(ISNULL(l.survey_appliances, N''), N' ', N'') + N',' LIKE N'%,ev,%'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_data d WHERE d.lead_id = l.id);
GO
