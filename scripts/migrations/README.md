# Migrations

Forward-only, versioned schema/data migrations. **This folder must stay empty until a new migration is added.**

## Conventions

- Filename: `NNN_<short-description>.mjs` — sequential, never reused
- Idempotent if possible (safe to re-run)
- One change per file — keep it small
- After applying to **prod**, leave the file here for one release cycle, then move to `_archive/migrations/`

## How to apply

```bash
node scripts/tools/apply_migration.mjs scripts/migrations/NNN_<name>.sql   # SQL files
node scripts/migrations/NNN_<name>.mjs                                      # mjs files
```

## Environment safety

UAT shares the production database. Test new migrations against `solardb_dev` (or local) first. See top-level memory `uat-shares-prod-db`.
