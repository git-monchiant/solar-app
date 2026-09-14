-- One-time backfill for the ผู้ลงนามใบรับประกัน handover:
--   คุณอำนาจ พิบูลย์ (21)  signs everything dated up to 2026-07-31
--   เอกวิทย์ ปั้นแจ่ม (45)  signs from 2026-08-01 onward
--
-- Cutoff uses COALESCE(warranty_issued_at, warranty_start_date) — the exact
-- expression the cert's DATE field renders, so the rule matches the date a
-- reader sees printed on the paper. The two columns can sit ~2 months apart
-- (issued_at is when someone pressed the button; start_date is when the
-- install finished), so picking either one alone gives a different answer.
--
-- Leads with neither date have never had a cert issued — left NULL so they
-- pick up the app_settings default when they are issued.
DECLARE @cutoff DATETIME2 = '2026-08-01';
DECLARE @outgoing INT = 21;   -- คุณอำนาจ พิบูลย์
DECLARE @incoming INT = 45;   -- เอกวิทย์ ปั้นแจ่ม

UPDATE dbo.leads SET warranty_signer_user_id = @outgoing
WHERE warranty_signer_user_id IS NULL
  AND COALESCE(warranty_issued_at, warranty_start_date) < @cutoff;
PRINT CONCAT('locked to outgoing signer: ', @@ROWCOUNT);

UPDATE dbo.leads SET warranty_signer_user_id = @incoming
WHERE warranty_signer_user_id IS NULL
  AND COALESCE(warranty_issued_at, warranty_start_date) >= @cutoff;
PRINT CONCAT('locked to incoming signer: ', @@ROWCOUNT);
GO
