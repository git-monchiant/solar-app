// Revert leads 552, 560, 400, 408, 421: warranty → install (step 08 → 07).
// Scope: leads.status field ONLY — install data, payments, quotation, dates
// all untouched. Logged in lead_activities as admin (user id 1), one row each.
// Guarded: only flips a lead that is currently 'warranty' (skips otherwise),
// so a re-run or an already-moved lead is a no-op.
//
// Default target = solardb_dev. Default mode = dry-run. Pass --yes to apply.
//   node scripts/tools/revert_leads_warranty_to_install.mjs --db=solardb --yes
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const LEAD_IDS = [552, 560, 400, 408, 421];
const ADMIN_USER_ID = 1;
const FROM = 'warranty', TO = 'install';
const FROM_LABEL = 'ออกใบรับประกัน', TO_LABEL = 'กำลังติดตั้ง';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'} · ${FROM} → ${TO}\n`);

const before = await pool.request().query(
  `SELECT id, full_name, status FROM leads WHERE id IN (${LEAD_IDS.join(',')}) ORDER BY id`
);
console.log('--- before ---');
console.table(before.recordset);

const eligible = before.recordset.filter(r => r.status === FROM).map(r => r.id);
const skipped = before.recordset.filter(r => r.status !== FROM);
if (skipped.length) {
  console.log(`\n⚠️  Skipping ${skipped.length} not in '${FROM}': ` +
    skipped.map(r => `${r.id}(${r.status})`).join(', '));
}
const missing = LEAD_IDS.filter(id => !before.recordset.some(r => r.id === id));
if (missing.length) console.log(`⚠️  Not found: ${missing.join(', ')}`);
console.log(`\nWill revert ${eligible.length} lead(s): ${eligible.join(', ') || '(none)'}`);

if (!execute) {
  console.log('\nDry-run only — pass --yes to apply.');
  await pool.close();
  process.exit(0);
}
if (eligible.length === 0) {
  console.log('\nNothing to do.');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const id of eligible) {
    // Guarded update — only flips while still 'warranty'.
    const upd = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`UPDATE leads SET status = '${TO}', updated_at = SYSUTCDATETIME()
              WHERE id = @id AND status = '${FROM}'`);
    if (upd.rowsAffected[0] !== 1) {
      throw new Error(`lead ${id}: expected 1 row updated, got ${upd.rowsAffected[0]} (status changed under us?)`);
    }
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('by', sql.Int, ADMIN_USER_ID)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by, created_at)
        VALUES (@id, 'status_change',
                N'Status: ${FROM_LABEL} → ${TO_LABEL} (revert)',
                '${FROM}', '${TO}', @by, SYSUTCDATETIME())
      `);
    console.log(`  ✓ lead ${id}: ${FROM} → ${TO}`);
  }
  await tx.commit();
  const after = await pool.request().query(
    `SELECT id, full_name, status FROM leads WHERE id IN (${LEAD_IDS.join(',')}) ORDER BY id`
  );
  console.log('\n--- after ---');
  console.table(after.recordset);
  console.log('OK');
} catch (e) {
  await tx.rollback();
  console.error('FAILED, rolled back:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
