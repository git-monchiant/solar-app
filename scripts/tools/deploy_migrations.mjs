// Apply every pending SQL migration in scripts/migrations/ to a target DB,
// in filename order. Successful files get moved to scripts/_archive/migrations/
// so the next run only sees what's new.
//
// Usage:
//   node scripts/tools/deploy_migrations.mjs --db=solardb_dev          # dry-run
//   node scripts/tools/deploy_migrations.mjs --db=solardb_dev --yes    # apply
//   node scripts/tools/deploy_migrations.mjs --db=solardb     --yes    # PROD
//
// --db is REQUIRED. --yes is REQUIRED to actually run.

import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const execute = args.includes('--yes');

if (!dbArg) {
  console.error('Usage: node scripts/tools/deploy_migrations.mjs --db=<solardb|solardb_dev> [--yes]');
  process.exit(1);
}
const database = dbArg.split('=')[1];
if (!database) { console.error('Empty --db value'); process.exit(1); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(repoRoot, 'scripts', 'migrations');
const archiveDir = path.join(repoRoot, 'scripts', '_archive', 'migrations');

const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('No pending migrations in scripts/migrations/');
  process.exit(0);
}

console.log(`Target DB:  ${database}`);
if (database === 'solardb') console.log('⚠️  PRODUCTION DATABASE');
console.log(`Mode:       ${execute ? 'EXECUTE' : 'DRY-RUN (pass --yes to apply)'}`);
console.log(`\nPending migrations (${files.length}):`);
for (const f of files) console.log(`  - ${f}`);

if (!execute) process.exit(0);

const config = {
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
};

const pool = await sql.connect(config);
fs.mkdirSync(archiveDir, { recursive: true });

let okCount = 0, failedAt = null;
for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  console.log(`\n→ ${file}`);
  const content = fs.readFileSync(fullPath, 'utf8');
  const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(b => b && (!b.startsWith('--') || b.includes('\n')));
  try {
    for (const batch of batches) {
      if (!batch.trim()) continue;
      await pool.request().batch(batch);
    }
    fs.renameSync(fullPath, path.join(archiveDir, file));
    console.log(`  OK · archived → scripts/_archive/migrations/${file}`);
    okCount++;
  } catch (e) {
    console.log(`  ERR: ${e.message}`);
    failedAt = file;
    break;
  }
}

await pool.close();

if (failedAt) {
  console.log(`\nStopped at ${failedAt}. ${okCount} migration(s) applied. Fix the file (or DB state) and re-run.`);
  process.exit(1);
}
console.log(`\nDone. ${okCount} migration(s) applied.`);
