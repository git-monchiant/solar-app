-- Speed up the per-row correlated subqueries that today/route.ts runs against
-- lead_activities (last activity note/date, contact count, follow-up overdue
-- NOT EXISTS). Without this index every subquery scans the table once per
-- result row — combined across ~10 parallel queries this caused the API to
-- timeout (ETIMEOUT at 15s, total ~22s) once the table reached production
-- size.
--
-- Covering columns chosen so the most common subqueries (TOP 1 by created_at,
-- COUNT by activity_type, NOT EXISTS by activity_type + followup_date) can be
-- answered straight from the index without a heap lookup.
CREATE NONCLUSTERED INDEX idx_lead_activities_lead_id_created_at
  ON lead_activities (lead_id, created_at DESC)
  INCLUDE (activity_type, note, followup_date);
