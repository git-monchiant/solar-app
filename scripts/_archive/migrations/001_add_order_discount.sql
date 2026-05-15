-- Add discount columns to leads for the order step.
-- Both columns are nullable; either or both can be set.
--
-- Apply:
--   node scripts/tools/apply_migration.mjs scripts/migrations/001_add_order_discount.sql
--
-- After applying to prod, move this file to scripts/_archive/migrations/.

ALTER TABLE leads
  ADD order_discount_pct DECIMAL(5, 2) NULL,
      order_discount_amount DECIMAL(12, 2) NULL;
