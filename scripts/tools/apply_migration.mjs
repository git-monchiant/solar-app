// Apply a SQL migration file. Splits on GO batches.
//
// Usage:
//   node scripts/tools/apply_migration.mjs --db=solardb_dev path/to/file.sql
//   node scripts/tools/apply_migration.mjs --db=solardb     path/to/file.sql   # PROD!
//
// --db is REQUIRED (no default) to prevent accidentally running on prod.

import sql from 'mssql';
import fs from 'fs';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const file = args.find(a => !a.startsWith('--'));

if (!dbArg || !file) {
  console.error('Usage: node scripts/tools/apply_migration.mjs --db=<solardb|solardb_dev> <file.sql>');
  process.exit(1);
}

const database = dbArg.split('=')[1];
if (!database) { console.error('Empty --db value'); process.exit(1); }

const config = {
  server: '172.41.1.73',
  port: 1433,
  user: 'monchiant',
  password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
};

console.log(`Applying ${file} → ${database}`);
if (database === 'solardb') console.log('⚠️  PRODUCTION DATABASE');

const content = fs.readFileSync(file, 'utf8');
const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(b => b && (!b.startsWith('--') || b.includes('\n')));

const pool = await sql.connect(config);
for (const batch of batches) {
  if (!batch.trim()) continue;
  console.log('-- batch --');
  console.log(batch.substring(0, 200));
  await pool.request().batch(batch);
}
console.log('OK');
await pool.close();