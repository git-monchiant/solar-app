// Clean the quotation PDF on lead 652 so the next upload starts fresh.
//   1) leads.quotation_files = NULL   (in --db= target)
//   2) public/uploads/QT-260652.pdf unlinked from LOCAL disk
//      (prod's copy lives on prod server — clean via SSH if needed)
//
// Why: upload route writes the file with a deterministic name
// (QT-{yy}{leadId4}.pdf), so re-uploading produces the same URL and
// browser/CDN caches keep serving the stale PDF. Clearing the field +
// removing the file forces the UI to treat the next upload as new.
//
// Defaults: dev DB, dry-run. Pass --yes to apply.
//   node scripts/tools/clean_lead_652_quotation.mjs           # dry-run on dev
//   node scripts/tools/clean_lead_652_quotation.mjs --yes     # apply on dev
//   node scripts/tools/clean_lead_652_quotation.mjs --db=solardb --yes   # PROD (ask first)
import sql from 'mssql';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const LEAD_ID = 652;
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

console.log(`Target DB:    ${database}`);
console.log(`Mode:         ${execute ? 'EXECUTE' : 'DRY-RUN (pass --yes to apply)'}`);
console.log(`Lead:         ${LEAD_ID}`);
console.log(`PDF path:     ${pdfPath}\n`);

const before = await pool.request().query(`SELECT id, quotation_files FROM leads WHERE id = ${LEAD_ID}`);
console.log('--- before (DB) ---');
console.table(before.recordset);

let pdfExistsLocal = false;
try { await fs.stat(pdfPath); pdfExistsLocal = true; } catch {}
console.log(`Local PDF exists: ${pdfExistsLocal}`);

if (!execute) {
  console.log('\nWould execute:');
  console.log(`  UPDATE leads SET quotation_files = NULL, updated_at = SYSUTCDATETIME() WHERE id = ${LEAD_ID};`);
  if (pdfExistsLocal) console.log(`  rm ${pdfPath}`);
  else console.log('  (no local PDF to delete)');
  await pool.close();
  process.exit(0);
}

await pool.request().query(`
  UPDATE leads SET quotation_files = NULL, updated_at = SYSUTCDATETIME() WHERE id = ${LEAD_ID}
`);
console.log('DB field cleared.');

if (pdfExistsLocal) {
  await fs.unlink(pdfPath);
  console.log(`Deleted ${pdfPath}`);
} else {
  console.log('Skipped file delete — no local copy.');
}

const after = await pool.request().query(`SELECT id, quotation_files FROM leads WHERE id = ${LEAD_ID}`);
console.log('\n--- after (DB) ---');
console.table(after.recordset);

await pool.close();
console.log('OK');
