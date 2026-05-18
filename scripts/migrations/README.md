# Migrations

Forward-only, versioned schema/data migrations pending **prod**. This folder
stays empty in the steady state — every file here is moved to
`_archive/migrations/` as soon as it has been applied to prod.

## Conventions

- Filename: `NNN_<short-description>.{sql|mjs}` — sequential, never reused
- Idempotent if possible (safe to re-run)
- One change per file — keep it small
- `.mjs` migrations MUST accept `--db=<name>` and exit non-zero on failure
  so the deploy tool can spawn + verify them

## How to apply

```bash
# Test on dev first (does NOT archive — files stay so you can re-deploy to prod)
node scripts/tools/deploy_migrations.mjs --db=solardb_dev --yes

# Production — applies all pending in order, archives on success
node scripts/tools/deploy_migrations.mjs --db=solardb --yes
```

Both `.sql` and `.mjs` files are picked up automatically. SQL runs via the
mssql driver, mjs is spawned as a child process.

The dev DB (`solardb_dev`) lives on the same MSSQL instance as prod
(`solardb`); see top-level memory `prod-deploy-script` for the env distinction.
