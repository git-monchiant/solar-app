// Sync solardb_dev to look exactly like solardb (prod): same tables, same
// columns, same data. Used because the DB user has CRUD on both DBs but no
// BACKUP/RESTORE privileges. Both DBs live on the same MSSQL instance.
//
// Strategy:
//   1. Drop all FK constraints in dst
//   2. Drop all tables in dst
//   3. For each table in src: SELECT * INTO dst (preserves schema + data +
//      IDENTITY in one shot)
//   4. Recreate primary keys from src metadata
//
// Also recreated:
//   - DEFAULT constraints (so INSERTs that omit columns like created_at work)
//
// NOT recreated (sufficient for app testing, can be added if needed):
//   - non-PK indexes
//   - FK constraints
//   - CHECK constraints
//   - triggers
//
// Usage:
//   node scripts/tools/copy_db.mjs           # dry-run
//   node scripts/tools/copy_db.mjs --yes     # execute (DESTRUCTIVE on dst)

import sql from 'mssql';

const SRC = 'solardb';
const DST = 'solardb_dev';
const EXECUTE = process.argv.includes('--yes');

const config = {
  server: '172.41.1.73',
  port: 1433,
  user: 'monchiant',
  password: 'monchiant',
  database: 'master',
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 600000,
};

const pool = await sql.connect(config);

console.log(`Source: ${SRC}`);
console.log(`Dest:   ${DST}`);
console.log(`Mode:   ${EXECUTE ? 'EXECUTE (will DROP+RECREATE all tables in dst)' : 'DRY-RUN (read only)'}\n`);

const listTables = (db) => pool.request().query(`
  SELECT s.name AS schema_name, t.name AS table_name
  FROM [${db}].sys.tables t
  JOIN [${db}].sys.schemas s ON t.schema_id = s.schema_id
  WHERE t.is_ms_shipped = 0
  ORDER BY s.name, t.name
`).then(r => r.recordset);

const srcTables = await listTables(SRC);
const dstTables = await listTables(DST);
const srcSet = new Set(srcTables.map(t => `${t.schema_name}.${t.table_name}`));
const dstOnly = dstTables.filter(t => !srcSet.has(`${t.schema_name}.${t.table_name}`));

console.log(`Tables in ${SRC}: ${srcTables.length}`);
console.log(`Tables in ${DST}: ${dstTables.length} (${dstOnly.length} extra to be dropped)`);
if (dstOnly.length) dstOnly.forEach(t => console.log(`  drop-only: ${t.schema_name}.${t.table_name}`));
console.log();

if (!EXECUTE) {
  console.log('Source tables (will be copied, schema + data):');
  for (const t of srcTables) {
    const fq = `[${t.schema_name}].[${t.table_name}]`;
    const c = (await pool.request().query(`SELECT COUNT(*) AS n FROM [${SRC}].${fq}`)).recordset[0].n;
    console.log(`  ${fq.padEnd(40)} ${c} rows`);
  }
  console.log('\nDry-run. Pass --yes to execute.');
  await pool.close();
  process.exit(0);
}

// 1. Drop all FK constraints in dst
console.log('Dropping FK constraints in dst ...');
const fks = (await pool.request().query(`
  SELECT s.name AS schema_name, t.name AS table_name, fk.name AS fk_name
  FROM [${DST}].sys.foreign_keys fk
  JOIN [${DST}].sys.tables t ON fk.parent_object_id = t.object_id
  JOIN [${DST}].sys.schemas s ON t.schema_id = s.schema_id
`)).recordset;
for (const fk of fks) {
  await pool.request().query(`ALTER TABLE [${DST}].[${fk.schema_name}].[${fk.table_name}] DROP CONSTRAINT [${fk.fk_name}]`);
}
console.log(`  dropped ${fks.length} FKs`);

// 2. Drop all tables in dst
console.log('Dropping all tables in dst ...');
for (const t of dstTables) {
  try {
    await pool.request().query(`DROP TABLE [${DST}].[${t.schema_name}].[${t.table_name}]`);
  } catch (e) {
    console.log(`  WARN drop ${t.schema_name}.${t.table_name}: ${e.message}`);
  }
}
console.log(`  dropped ${dstTables.length} tables`);

// 3. SELECT * INTO from src for each src table
console.log('\nCopying tables (schema + data + identity) ...');
let okCount = 0, errCount = 0, totalRows = 0;
for (const t of srcTables) {
  const fq = `[${t.schema_name}].[${t.table_name}]`;
  process.stdout.write(`  ${fq.padEnd(40)} `);
  try {
    const r = await pool.request().query(`SELECT * INTO [${DST}].${fq} FROM [${SRC}].${fq}`);
    const rows = r.rowsAffected[0] ?? 0;
    console.log(`→ ${rows} rows`);
    totalRows += rows;
    okCount++;
  } catch (e) {
    console.log(`ERR: ${e.message}`);
    errCount++;
  }
}

// 4. Recreate primary keys from src
console.log('\nRecreating primary keys ...');
const pkRows = (await pool.request().query(`
  SELECT s.name AS schema_name, t.name AS table_name,
         kc.name AS pk_name, ic.key_ordinal, c.name AS col_name
  FROM [${SRC}].sys.key_constraints kc
  JOIN [${SRC}].sys.tables t ON kc.parent_object_id = t.object_id
  JOIN [${SRC}].sys.schemas s ON t.schema_id = s.schema_id
  JOIN [${SRC}].sys.index_columns ic ON ic.object_id = t.object_id AND ic.index_id = kc.unique_index_id
  JOIN [${SRC}].sys.columns c ON c.object_id = t.object_id AND c.column_id = ic.column_id
  WHERE kc.type = 'PK'
  ORDER BY s.name, t.name, ic.key_ordinal
`)).recordset;

const pkGroups = new Map();
for (const r of pkRows) {
  const key = `${r.schema_name}.${r.table_name}`;
  if (!pkGroups.has(key)) pkGroups.set(key, { schema: r.schema_name, table: r.table_name, name: r.pk_name, cols: [] });
  pkGroups.get(key).cols.push(r.col_name);
}

let pkOk = 0, pkErr = 0;
for (const pk of pkGroups.values()) {
  const cols = pk.cols.map(c => `[${c}]`).join(', ');
  try {
    await pool.request().query(`ALTER TABLE [${DST}].[${pk.schema}].[${pk.table}] ADD CONSTRAINT [${pk.name}] PRIMARY KEY (${cols})`);
    console.log(`  PK ${pk.schema}.${pk.table} (${pk.cols.join(',')}) ok`);
    pkOk++;
  } catch (e) {
    console.log(`  PK ${pk.schema}.${pk.table} ERR: ${e.message}`);
    pkErr++;
  }
}

// 5. Recreate DEFAULT constraints from src
console.log('\nRecreating DEFAULT constraints ...');
const defs = (await pool.request().query(`
  SELECT t.name AS tbl, c.name AS col, dc.name AS dc_name, dc.definition AS def
  FROM [${SRC}].sys.default_constraints dc
  JOIN [${SRC}].sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
  JOIN [${SRC}].sys.tables t ON c.object_id = t.object_id
  ORDER BY t.name, c.name
`)).recordset;

let defOk = 0, defErr = 0;
for (const d of defs) {
  try {
    await pool.request().query(`ALTER TABLE [${DST}].dbo.[${d.tbl}] ADD CONSTRAINT [${d.dc_name}] DEFAULT ${d.def} FOR [${d.col}]`);
    defOk++;
  } catch (e) {
    console.log(`  DEF ${d.tbl}.${d.col} ERR: ${e.message}`);
    defErr++;
  }
}
console.log(`  ${defOk}/${defs.length} defaults applied`);

console.log(`\nDone. tables ok=${okCount} err=${errCount} rows=${totalRows} pks ok=${pkOk} err=${pkErr} defaults ok=${defOk} err=${defErr}`);
await pool.close();

// ── prod public/uploads/ → local public/uploads/ ─────────────────────────
// DB blobs (slip_data, picture_blob, signature_data) come down with the
// table copy above, but lead-uploaded files live on disk at prod's
// public/uploads/. Mirror them so quotation PDFs, survey photos, and any
// other file-backed URL renders correctly when poking around the dev app.
// --delete keeps local in lockstep with prod (orphan dev-only files get
// removed; safe because prod is the canonical source of truth).
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const LOCAL_UPLOADS = path.join(REPO_ROOT, 'public', 'uploads');
const PRD = { host: '172.22.22.100', port: '1822', user: 'optimus-dev', pass: '0pt!musd3V', dir: '/home/optimus-dev/solar-app/uploads/' };

// Unreachable in dry-run (process.exit(0) above), so only the EXECUTE path
// matters here.
if (!existsSync(LOCAL_UPLOADS)) mkdirSync(LOCAL_UPLOADS, { recursive: true });
console.log('\nSyncing public/uploads/ from prod ...');
try {
  execSync('which rsync', { stdio: 'pipe' });
  execSync('which sshpass', { stdio: 'pipe' });
  const ssh = `ssh -p ${PRD.port} -o StrictHostKeyChecking=no -o LogLevel=ERROR`;
  const cmd = `sshpass -p '${PRD.pass}' rsync -a --delete -e "${ssh}" '${PRD.user}@${PRD.host}:${PRD.dir}' '${LOCAL_UPLOADS}/'`;
  execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
  const count = execSync(`ls -1 '${LOCAL_UPLOADS}' | wc -l`, { shell: '/bin/bash' }).toString().trim();
  console.log(`  ok — ${count} files in ${LOCAL_UPLOADS}`);
} catch (e) {
  console.log(`  skipped/failed: ${e.message?.split('\n')[0] || e}`);
  console.log('  (need: brew install rsync hudochenkov/sshpass/sshpass)');
}
