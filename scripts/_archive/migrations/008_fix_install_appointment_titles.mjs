// Fix appointment_* activities whose title says "นัดสำรวจ" but actually
// belong to the install phase. Earlier display logic (now patched in
// ActivityItem.tsx) inferred kind from title, so titles labelled the wrong
// kind were rendered as "นัดสำรวจ" forever. The route writes the correct
// title going forward, but legacy rows need a one-shot rewrite.
//
// Heuristic: an appointment activity is "install" if the same lead has
// already passed the survey step — i.e., the most recent status_change before
// the activity moved the lead to quote/order/install/warranty/gridtie/closed.
// Once past survey, every นัด/เลื่อน/ยืนยัน/ยกเลิก is by definition install.
//
// Usage:
//   node scripts/migrations/008_fix_install_appointment_titles.mjs --db=solardb_dev
//   node scripts/migrations/008_fix_install_appointment_titles.mjs --db=solardb
//   node scripts/migrations/008_fix_install_appointment_titles.mjs --db=solardb --dry-run

import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
const dryRun = args.includes('--dry-run');

if (!dbArg) {
  console.error('Usage: node scripts/migrations/008_fix_install_appointment_titles.mjs --db=<solardb|solardb_dev> [--dry-run]');
  process.exit(1);
}
const database = dbArg.split('=')[1];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB:  ${database}`);
if (database === 'solardb') console.log('⚠️  PRODUCTION DATABASE');
console.log(`Mode:       ${dryRun ? 'DRY-RUN (read only)' : 'EXECUTE'}\n`);

// Pull every appointment activity that mentions "สำรวจ" along with the most
// recent status_change to an install-or-later phase that landed before it.
const r = await pool.request().query(`
  SELECT a.id, a.lead_id, a.title, a.created_at,
    (SELECT TOP 1 sc.new_status
     FROM lead_activities sc
     WHERE sc.lead_id = a.lead_id
       AND sc.activity_type = 'status_change'
       AND sc.new_status IN ('quote', 'order', 'install', 'warranty', 'gridtie', 'closed')
       AND sc.created_at <= a.created_at
     ORDER BY sc.created_at DESC) AS install_phase_status
  FROM lead_activities a
  WHERE a.activity_type LIKE 'appointment_%'
    AND a.title LIKE N'%สำรวจ%'
`);

const candidates = r.recordset.filter(x => x.install_phase_status);
const skipped = r.recordset.length - candidates.length;
console.log(`Scanned: ${r.recordset.length} appointment-สำรวจ rows`);
console.log(`Will fix: ${candidates.length} (skipping ${skipped} that are real survey appointments)\n`);

const rewrite = (s) => s
  .replace(/เลื่อนนัดสำรวจ/g, 'เลื่อนนัดติดตั้ง')
  .replace(/ยืนยันนัดสำรวจ/g, 'ยืนยันนัดติดตั้ง')
  .replace(/ยกเลิกนัดสำรวจ/g, 'ยกเลิกนัดติดตั้ง')
  .replace(/นัดสำรวจ/g, 'นัดติดตั้ง');

let updated = 0;
for (const a of candidates) {
  const newTitle = rewrite(a.title);
  if (newTitle === a.title) continue;
  if (!dryRun) {
    await pool.request()
      .input('id', sql.Int, a.id)
      .input('t', sql.NVarChar(200), newTitle)
      .query('UPDATE lead_activities SET title = @t WHERE id = @id');
  }
  console.log(`  ${String(a.id).padStart(5)} (lead ${a.lead_id}, was ${a.install_phase_status}): ${a.title}\n         → ${newTitle}`);
  updated++;
}

console.log(`\nDone. ${dryRun ? 'Would update' : 'Updated'} ${updated} row(s).`);
await pool.close();
