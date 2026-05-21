// Revert lead 653 status: order → quote (step 04 → step 03).
// Scope: status field ONLY — quotation, payment, install schedule untouched.
// Logged in lead_activities as admin (user id 1).
//
// Default target = solardb_dev. Default mode = dry-run. Pass --yes to apply.
//   node scripts/tools/revert_lead_653_status.mjs --db=solardb --yes
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const LEAD_ID = 653;
const ADMIN_USER_ID = 1;

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const before = await pool.request().query(`SELECT id, full_name, status FROM leads WHERE id = ${LEAD_ID}`);
console.log('--- before ---');
console.table(before.recordset);

if (!execute) {
  console.log('\nDry-run only — pass --yes to apply.');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  await new sql.Request(tx).input('id', sql.Int, LEAD_ID).query(`
    UPDATE leads SET status = 'quote', updated_at = SYSUTCDATETIME() WHERE id = @id
  `);
  await new sql.Request(tx)
    .input('id', sql.Int, LEAD_ID)
    .input('by', sql.Int, ADMIN_USER_ID)
    .query(`
      INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by, created_at)
      VALUES (@id, 'status_change',
              N'Status: รออนุมัติ/ชำระ → รอใบเสนอราคา (revert)',
              'order', 'quote', @by, SYSUTCDATETIME())
    `);
  await tx.commit();
  const after = await pool.request().query(`SELECT id, full_name, status FROM leads WHERE id = ${LEAD_ID}`);
  console.log('--- after ---');
  console.table(after.recordset);
  console.log('OK');
} catch (e) {
  await tx.rollback();
  console.error('FAILED, rolled back:', e.message);
  process.exit(1);
} finally {
  await pool.close();
}
