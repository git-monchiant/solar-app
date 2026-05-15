# Archive

Historical scripts kept for reference. Includes:

- One-off `apply-NNN.mjs` migrations that were applied to prod
- Ad-hoc `check-*` / `peek-*` / `find-*` inspection scripts (ticket-specific)
- One-off `backfill-*` / `fix-*` / `revert-*` / `cleanup-*` data fixes
- The original `adhoc/`, `migrations/`, `huawei/` subfolders

Nothing here should be re-run blindly — most are tied to a moment in time and a specific data state. Use them as templates if needed, then write a fresh script in `scripts/migrations/` (for prod-bound changes) or run inline.

Safe to delete this folder entirely once you're confident nothing here is still needed.
