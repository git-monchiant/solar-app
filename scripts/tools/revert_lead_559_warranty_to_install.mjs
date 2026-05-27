// Revert lead 559 status: warranty → install (step 06 → step 05).
// Scope: status field ONLY. Per user instruction: DO NOT clear any data —
// keep install_completed_at, warranty_doc_no, warranty_inverter_sn, etc.
// Logged in lead_activities as admin (user id 1).
//
// Default = solardb_dev + dry-run. Use --db=solardb --yes for prod.
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const LEAD_ID = 559;
const ADMIN_USER_ID = 1;

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database, options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const before = await pool.request().query(`
  SELECT id, full_name, status,
         install_date, install_completed_at,
         warranty_doc_no, warranty_inverter_sn
  FROM leads WHERE id = ${LEAD_ID}
`);
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
    UPDATE leads SET status = 'install', updated_at = SYSUTCDATETIME() WHERE id = @id
  `);
  await new sql.Request(tx)
    .input('id', sql.Int, LEAD_ID)
    .input('by', sql.Int, ADMIN_USER_ID)
    .query(`
      INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by, created_at)
      VALUES (@id, 'status_change',
              N'Status: รับประกัน → ติดตั้ง (revert, data preserved)',
              'warranty', 'install', @by, SYSUTCDATETIME())
    `);
  await tx.commit();
  const after = await pool.request().query(`
    SELECT id, full_name, status,
           install_date, install_completed_at,
           warranty_doc_no, warranty_inverter_sn
    FROM leads WHERE id = ${LEAD_ID}
  `);
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
