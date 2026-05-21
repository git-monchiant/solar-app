// Combined ops on lead 652 only:
//   1) leads.status: order → quote   (step 04 → step 03)
//   2) leads.quotation_files = NULL  + delete local public/uploads/QT-260652.pdf
//   3) lead_activities log entry attributed to user "admin" (id=1)
//
// Everything wrapped in a transaction. Default = dev + dry-run; --yes applies.
// Use --db=solardb --yes for prod (explicit ask required by feedback memory).
//
// Note: only deletes the LOCAL physical PDF. The prod-server copy at
// /home/.../public/uploads/QT-260652.pdf is unaffected — orphan it or clean
// via SSH separately.
import sql from 'mssql';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const LEAD_ID = 652;
const ADMIN_USER_ID = 1; // username='admin'
const PDF_NAME = 'QT-260652.pdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const pdfPath = path.join(repoRoot, 'public', 'uploads', PDF_NAME);

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB:  ${database}`);
console.log(`Mode:       ${execute ? 'EXECUTE' : 'DRY-RUN (pass --yes to apply)'}`);
console.log(`Lead:       ${LEAD_ID}`);
console.log(`Admin uid:  ${ADMIN_USER_ID}\n`);

const before = await pool.request().query(`
  SELECT id, full_name, status, quotation_files FROM leads WHERE id = ${LEAD_ID}
`);
console.log('--- before (DB) ---');
console.table(before.recordset);
let pdfExistsLocal = false;
try { await fs.stat(pdfPath); pdfExistsLocal = true; } catch {}
console.log(`Local PDF exists: ${pdfExistsLocal}`);

if (!execute) {
  console.log('\nWould execute (in a transaction):');
  console.log(`  UPDATE leads SET status='quote', quotation_files=NULL, updated_at=SYSUTCDATETIME() WHERE id=${LEAD_ID};`);
  console.log(`  INSERT lead_activities (lead_id, activity_type, title, old_status, new_status, created_by, created_at)`);
  console.log(`    VALUES (${LEAD_ID}, 'status_change', 'Status: รออนุมัติ/ชำระ → รอใบเสนอราคา (revert + clean PDF)', 'order', 'quote', ${ADMIN_USER_ID}, SYSUTCDATETIME());`);
  if (pdfExistsLocal) console.log(`  rm ${pdfPath}`);
  else console.log('  (no local PDF to delete)');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  await new sql.Request(tx).input('id', sql.Int, LEAD_ID).query(`
    UPDATE leads
    SET status = 'quote',
        quotation_files = NULL,
        updated_at = SYSUTCDATETIME()
    WHERE id = @id
  `);
  await new sql.Request(tx)
    .input('id', sql.Int, LEAD_ID)
    .input('by', sql.Int, ADMIN_USER_ID)
    .query(`
      INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status, created_by, created_at)
      VALUES (@id, 'status_change',
              N'Status: รออนุมัติ/ชำระ → รอใบเสนอราคา (revert + clean PDF)',
              'order', 'quote', @by, SYSUTCDATETIME())
    `);
  await tx.commit();
  console.log('DB updated + activity logged.');
} catch (e) {
  await tx.rollback();
  console.error('FAILED, rolled back:', e.message);
  await pool.close();
  process.exit(1);
}

if (pdfExistsLocal) {
  await fs.unlink(pdfPath);
  console.log(`Deleted ${pdfPath}`);
} else {
  console.log('Skipped file delete — no local copy.');
}

const after = await pool.request().query(`
  SELECT id, status, quotation_files FROM leads WHERE id = ${LEAD_ID}
`);
console.log('\n--- after (DB) ---');
console.table(after.recordset);

await pool.close();
console.log('OK');
