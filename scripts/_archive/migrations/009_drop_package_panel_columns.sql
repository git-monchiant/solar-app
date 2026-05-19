-- Drop solar_panels + panel_watt from packages — number of panels and watts
-- per panel are now collected per-lead during survey/warranty instead of being
-- baked into the package definition. App code stopped reading/writing these
-- columns in the same release that ships this migration.

ALTER TABLE packages DROP COLUMN solar_panels;
ALTER TABLE packages DROP COLUMN panel_watt;
