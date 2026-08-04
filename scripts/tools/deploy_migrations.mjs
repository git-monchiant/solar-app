// Apply every pending migration in scripts/migrations/ to a target DB, in
// filename order. Successful files are moved to scripts/_archive/migrations/
// ONLY when the target is prod (`solardb`) — dev runs leave files in place so
// the same script can re-apply them later for prod deploy.
//
// Handles both:
//   *.sql — split on GO batches, run via mssql.batch()
//   *.mjs — spawned as `node <file> --db=<database>` (must accept --db arg)
//
// Usage:
//   node scripts/tools/deploy_migrations.mjs --db=solardb_dev          # dry-run
//   node scripts/tools/deploy_migrations.mjs --db=solardb_dev --yes    # apply, no archive
//   node scripts/tools/deploy_migrations.mjs --db=solardb     --yes    # PROD: apply + archive

import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
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
if (!['solardb', 'solardb_dev'].includes(database)) {
  console.error(`Unsupported database "${database}". Use solardb_dev or solardb.`);
  process.exit(1);
}
const isProd = database === 'solardb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(repoRoot, 'scripts', 'migrations');
const archiveDir = path.join(repoRoot, 'scripts', '_archive', 'migrations');

const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql') || f.endsWith('.mjs'))
  .sort();

if (files.length === 0) {
  console.log('No pending migrations in scripts/migrations/');
  process.exit(0);
}

console.log(`Target DB:  ${database}`);
if (isProd) console.log('⚠️  PRODUCTION DATABASE — files will be archived on success');
else console.log('(dev — files stay in scripts/migrations/ after success)');
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
if (isProd) fs.mkdirSync(archiveDir, { recursive: true });

const applySql = async (fullPath) => {
  const content = fs.readFileSync(fullPath, 'utf8');
  const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(b => b && (!b.startsWith('--') || b.includes('\n')));
  for (const batch of batches) {
    if (!batch.trim()) continue;
    await pool.request().batch(batch);
  }
};

const applyMjs = (fullPath) => {
  // Spawn so the migration runs in its own process with its own DB connection.
  // Convention: every .mjs migration accepts `--db=<name>` and exits non-zero
  // on failure.
  const res = spawnSync('node', [fullPath, `--db=${database}`], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`exited with status ${res.status}`);
  }
};

let okCount = 0, failedAt = null;
for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  console.log(`\n→ ${file}`);
  try {
    if (file.endsWith('.sql')) await applySql(fullPath);
    else await applyMjs(fullPath);
    if (isProd) {
      fs.renameSync(fullPath, path.join(archiveDir, file));
      console.log(`  OK · archived → scripts/_archive/migrations/${file}`);
    } else {
      console.log(`  OK (left in place — dev run)`);
    }
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
