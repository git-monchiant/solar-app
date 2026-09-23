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
//   node scripts/tools/deploy_migrations.mjs --db=solardb_v3 --yes --dir=scripts/migrations-v3
//                                                                      # v3: โฟลเดอร์ migration แยก (ดู scripts/migrations-v3/README.md)
//   node ... --db=solardb_v3 --yes --dir=scripts/migrations-v3 --baseline
//                                                                      # ฐานที่รันไปแล้วก่อนมีทะเบียน: จดว่า "ผ่านแล้ว" โดยไม่รันซ้ำ
//
// ★ ทะเบียน migration (เพิ่ม 23 ก.ย. 69)
//   ฝั่ง dev/v3 ไม่ archive ไฟล์ ⇒ รันทีไรก็ไล่ตั้งแต่ไฟล์แรกใหม่ทุกครั้ง
//   ใช้ได้เฉพาะเมื่อ migration ทุกไฟล์ idempotent — วัดจริง 23 ก.ย.: 18 จาก 50 ไฟล์ไม่ใช่
//   (CREATE TABLE/INDEX ไม่มี guard) ⇒ ตายที่ไฟล์แรกที่ซ้ำเสมอ รันทั้งชุดรวดเดียวไม่ได้
//   ซึ่งเป็นสิ่งที่ README ของ migrations-v3 บอกว่าต้องซ้อมให้ได้ก่อน cutover
//   ⇒ จดชื่อไฟล์ที่สำเร็จลง dbo._migrations_applied แล้วข้ามไฟล์ที่จดไว้แล้ว
//   แก้ที่ runner ที่เดียว ไม่ต้องไล่แก้ migration 18 ไฟล์ของคนอื่น
//   ★ ฐานที่ copy มาจาก prod จะไม่มีตารางนี้ ⇒ ทะเบียนว่าง ⇒ รันครบทั้งชุดตามลำดับ
//     (ตรงกับที่ README ต้องการสำหรับซ้อมใหญ่ cutover)

import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const dirArg = args.find(a => a.startsWith('--dir='));
const execute = args.includes('--yes');
const baseline = args.includes('--baseline');   // จดว่าผ่านแล้วโดยไม่รัน (ฐานเก่าที่รันไปก่อนมีทะเบียน)

if (!dbArg) {
  console.error('Usage: node scripts/tools/deploy_migrations.mjs --db=<solardb|solardb_dev|solardb_v3> [--yes] [--dir=scripts/migrations-v3]');
  process.exit(1);
}
const database = dbArg.split('=')[1];
if (!database) { console.error('Empty --db value'); process.exit(1); }
if (!['solardb', 'solardb_dev', 'solardb_v3'].includes(database)) {
  console.error(`Unsupported database "${database}". Use solardb_dev, solardb_v3 or solardb.`);
  process.exit(1);
}
const isProd = database === 'solardb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = dirArg
  ? path.resolve(repoRoot, dirArg.split('=')[1])
  : path.join(repoRoot, 'scripts', 'migrations');
if (!fs.existsSync(migrationsDir)) {
  console.error(`Migrations dir not found: ${migrationsDir}`);
  process.exit(1);
}
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

// ── ทะเบียน migration ────────────────────────────────────────────────────
// ชื่อขึ้นต้นด้วย _ ให้ไปอยู่ท้ายสุดเวลาเรียงตาราง และไม่ชนกับตารางของงานจริง
await pool.request().batch(`
  IF OBJECT_ID('dbo._migrations_applied', 'U') IS NULL
  CREATE TABLE dbo._migrations_applied (
    filename    NVARCHAR(200) NOT NULL PRIMARY KEY,
    applied_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    note        NVARCHAR(200) NULL
  );`);

const appliedRows = await pool.request().query('SELECT filename FROM dbo._migrations_applied');
const applied = new Set(appliedRows.recordset.map(r => r.filename));

const markApplied = async (file, note) => {
  await pool.request()
    .input('f', sql.NVarChar(200), file)
    .input('n', sql.NVarChar(200), note ?? null)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo._migrations_applied WHERE filename = @f)
              INSERT INTO dbo._migrations_applied (filename, note) VALUES (@f, @n);`);
};

if (baseline) {
  let n = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    await markApplied(file, 'baseline — ถือว่ารันไปแล้วก่อนมีทะเบียน');
    n++;
  }
  await pool.close();
  console.log(`\nBaseline: จด ${n} ไฟล์ว่าผ่านแล้ว (ไม่ได้รันอะไรเลย) · รวมในทะเบียน ${applied.size + n} ไฟล์`);
  process.exit(0);
}

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

let okCount = 0, skipCount = 0, failedAt = null;
for (const file of files) {
  if (applied.has(file)) { skipCount++; continue; }   // จดในทะเบียนแล้ว = ผ่านไปแล้ว
  const fullPath = path.join(migrationsDir, file);
  console.log(`\n→ ${file}`);
  try {
    if (file.endsWith('.sql')) await applySql(fullPath);
    else await applyMjs(fullPath);
    await markApplied(file);
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
  console.log(`\nStopped at ${failedAt}. ${okCount} applied${skipCount ? `, ${skipCount} skipped` : ''}. Fix the file (or DB state) and re-run.`);
  process.exit(1);
}
console.log(`\nDone. ${okCount} migration(s) applied${skipCount ? `, ${skipCount} skipped (จดในทะเบียนแล้ว)` : ''}.`);
