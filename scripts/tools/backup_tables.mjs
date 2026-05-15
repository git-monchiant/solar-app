// In-DB table backup. Creates `<table>_bak_<YYYYMMDD_HHMMSS>` via SELECT INTO
// so schema + data are preserved without needing BACKUP/RESTORE privileges.
//
// Usage:
//   node scripts/tools/backup_tables.mjs --db=solardb --tables=leads,payments
//   node scripts/tools/backup_tables.mjs --db=solardb_dev --tables=leads
//
// Both args are REQUIRED. Backup table names print at the end so you can drop
// them later (e.g. `DROP TABLE leads_bak_20260515_142301`).

import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const tablesArg = args.find(a => a.startsWith('--tables='));

if (!dbArg || !tablesArg) {
  console.error('Usage: node scripts/tools/backup_tables.mjs --db=<solardb|solardb_dev> --tables=t1,t2,...');
  process.exit(1);
}
const database = dbArg.split('=')[1];
const tables = tablesArg.split('=')[1].split(',').map(t => t.trim()).filter(Boolean);
if (!database || tables.length === 0) {
  console.error('Empty --db or --tables value');
  process.exit(1);
}

const stamp = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
})();

console.log(`Target DB:  ${database}`);
if (database === 'solardb') console.log('⚠️  PRODUCTION DATABASE');
console.log(`Stamp:      ${stamp}\n`);

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 600000,
});

const created = [];
for (const t of tables) {
  const bakName = `${t}_bak_${stamp}`;
  process.stdout.write(`Backing up ${t} → ${bakName} ... `);
  try {
    const r = await pool.request().query(`SELECT * INTO [dbo].[${bakName}] FROM [dbo].[${t}]`);
    const rows = r.rowsAffected[0] ?? 0;
    console.log(`OK (${rows} rows)`);
    created.push(bakName);
  } catch (e) {
    console.log(`ERR: ${e.message}`);
  }
}

await pool.close();

console.log(`\nBackup tables created (drop manually when no longer needed):`);
created.forEach(n => console.log(`  DROP TABLE [dbo].[${n}];`));
