// Revert lead 652 status: order → quote (step 04 → step 03).
//
// Scope per user instruction: status field ONLY. Install appointment,
// payment_confirmed flag, booking doc, and the ฿56,060 payment record on
// step 04 are intentionally LEFT INTACT — lead may look temporarily
// inconsistent until those are cleaned up separately.
//
// Default target = solardb_dev (do NOT touch prod without explicit ask).
// Default mode = dry-run. Pass --yes to actually apply.
//
// Usage:
//   node scripts/tools/revert_lead_652_status.mjs               # dry-run on dev
//   node scripts/tools/revert_lead_652_status.mjs --yes         # apply on dev
//   node scripts/tools/revert_lead_652_status.mjs --db=solardb --yes   # PROD (ask first)
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const LEAD_ID = 652;

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB: ${database}`);
console.log(`Mode:      ${execute ? 'EXECUTE' : 'DRY-RUN (pass --yes to apply)'}\n`);

const before = await pool.request().query(`
  SELECT id, full_name, status FROM leads WHERE id = ${LEAD_ID}
`);
if (before.recordset.length === 0) {
  console.error(`Lead ${LEAD_ID} not found in ${database}.`);
  process.exit(1);
}
console.log('--- before ---');
console.table(before.recordset);

if (before.recordset[0].status !== 'order') {
  console.warn(`Warning: current status is "${before.recordset[0].status}", not "order". Continuing anyway if --yes.`);
}

if (!execute) {
  console.log('\nWould execute:');
  console.log(`  UPDATE leads SET status = 'quote', updated_at = SYSUTCDATETIME() WHERE id = ${LEAD_ID};`);
  console.log(`  INSERT lead_activities (lead_id, activity_type, title, old_status, new_status, created_at)`);
  console.log(`    VALUES (${LEAD_ID}, 'status_change', 'Status: รออนุมัติ/ชำระ → รอใบเสนอราคา (revert)', 'order', 'quote', SYSUTCDATETIME());`);
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  await new sql.Request(tx).input('id', sql.Int, LEAD_ID).query(`
    UPDATE leads SET status = 'quote', updated_at = SYSUTCDATETIME() WHERE id = @id
  `);
  await new sql.Request(tx).input('id', sql.Int, LEAD_ID).query(`
    INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_at)
    VALUES (@id, 'status_change', N'Status: รออนุมัติ/ชำระ → รอใบเสนอราคา (revert)', 'order', 'quote', SYSUTCDATETIME())
  `);
  await tx.commit();
  console.log('\n--- after ---');
  const after = await pool.request().query(`SELECT id, full_name, status FROM leads WHERE id = ${LEAD_ID}`);
  console.table(after.recordset);
  console.log('OK');
} catch (e) {
  await tx.rollback();
  console.error('FAILED, rolled back:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
