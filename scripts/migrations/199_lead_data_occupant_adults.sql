-- Customer Profile — occupants were asked as ผู้สูงอายุ / เด็ก / สัตว์เลี้ยง and
-- occupant_total was their sum, so a working-age adult was never counted and a
-- pet was counted as a person. The survey report printed that sum as "N คน".
--
-- Adds the missing adults count and redefines occupant_total as PEOPLE only:
--   occupant_total = adults + elderly + kids   (pets stay in occupant_pets)
-- The API recomputes it on every occupant change from now on; this backfill
-- applies the same rule to existing rows. Old rows have no adults answer, so
-- their total is elderly + kids — an undercount, but no longer inflated by pets.
-- NULL when nothing counts, matching what the form has always stored for 0.
--
-- Idempotent: re-running recomputes the same values.

IF COL_LENGTH('dbo.lead_data', 'occupant_adults') IS NULL
  ALTER TABLE dbo.lead_data ADD occupant_adults INT NULL;
GO

UPDATE dbo.lead_data
SET occupant_total = NULLIF(ISNULL(occupant_adults, 0) + ISNULL(occupant_elderly, 0) + ISNULL(occupant_kids, 0), 0)
WHERE ISNULL(occupant_total, -1) <> ISNULL(NULLIF(ISNULL(occupant_adults, 0) + ISNULL(occupant_elderly, 0) + ISNULL(occupant_kids, 0), 0), -1);
GO
