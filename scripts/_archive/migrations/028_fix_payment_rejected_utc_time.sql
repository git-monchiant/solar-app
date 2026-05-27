-- /api/payments/reject inserted into lead_activities using SYSUTCDATETIME()
-- (UTC) instead of GETDATE() (Bangkok local). All payment_rejected rows
-- created before the code fix have created_at 7 hours behind real local time,
-- so they appear out of order in the timeline (e.g. reject at "01:43" sandwiched
-- between "10:00" upload and "10:05" submit on the same morning).
--
-- Cutoff = the timestamp of the code fix in dev (≈26-May-2026 08:55 ICT =
-- 01:55 UTC). Any row stored before this point was written by the buggy code
-- and needs +7h to align. The compare is naïve datetime2 (no TZ awareness) —
-- after the +7h shift the new value will be > the cutoff so the UPDATE is
-- idempotent if accidentally re-run.

UPDATE lead_activities
SET created_at = DATEADD(HOUR, 7, created_at)
WHERE activity_type = 'payment_rejected'
  AND created_at < '2026-05-26T01:55:00';
GO
