// Ad-hoc: append " + battery" to leads.install_note for lead id=562.
// Run dry-run first (no --yes) → review the SELECT result + planned UPDATE.
// Then re-run with --yes to commit. Idempotent: skips if " + battery"
// already present in the current text.
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');

const LEAD_ID = 562;
const SUFFIX = ' + battery';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const current = await pool.request()
  .input('id', sql.Int, LEAD_ID)
  .query(`SELECT id, full_name, install_note FROM leads WHERE id = @id`);

if (current.recordset.length === 0) {
  console.log(`❌ Lead ${LEAD_ID} not found in ${database}`);
  await pool.close();
  process.exit(1);
}

const row = current.recordset[0];
console.log(`Lead ${row.id} · ${row.full_name}`);
console.log(`  Current install_note: ${JSON.stringify(row.install_note)}`);

if (row.install_note && row.install_note.includes(SUFFIX.trim())) {
  console.log(`\n⚠️  install_note already contains "${SUFFIX.trim()}" — skipping (idempotent guard).`);
  await pool.close();
  process.exit(0);
}

const newNote = (row.install_note || '') + SUFFIX;
console.log(`  Planned  install_note: ${JSON.stringify(newNote)}`);

if (!execute) {
  console.log('\nDry-run only — pass --yes to apply.');
  await pool.close();
  process.exit(0);
}

const result = await pool.request()
  .input('id', sql.Int, LEAD_ID)
  .input('note', sql.NVarChar(sql.MAX), newNote)
  .query(`UPDATE leads SET install_note = @note WHERE id = @id`);

console.log(`\n✓ Updated ${result.rowsAffected[0]} row.`);
await pool.close();
