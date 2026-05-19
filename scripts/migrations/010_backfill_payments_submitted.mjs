// Backfill payments.submitted_by + submitted_at from lead_activities.
//
// Step 1 of every slip flow (sale clicks "ส่งสลิป") writes a `slip_submitted`
// activity with the user id who pressed the button and a title that embeds
// the payment step label (e.g. "ตรวจสลิป ค่าจอง Survey (รอบัญชียืนยัน)").
//
// For each payment row that's still missing submitted_by/_at, find the
// matching slip_submitted activity for the same lead + slip_field and copy
// its created_by / created_at into the payment row.
//
// Idempotent: only updates rows where submitted_at IS NULL, so running
// twice is safe. Stops complaining if the activity is missing — rows from
// the very early days simply stay null and the UI shows them as legacy.
//
// Usage:
//   node scripts/migrations/010_backfill_payments_submitted.mjs --db=solardb_dev
//   node scripts/migrations/010_backfill_payments_submitted.mjs --db=solardb

import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
if (!dbArg) {
  console.error('Usage: node 010_backfill_payments_submitted.mjs --db=<solardb|solardb_dev>');
  process.exit(1);
}
const database = dbArg.split('=')[1];

// slip_field → Thai label used in activity titles (mirrors lib/lead-activity-log.ts)
function labelFor(slipField) {
  if (slipField === 'pre_slip_url') return 'ค่าจอง Survey';
  if (slipField === 'order_before_slip') return 'ก่อนติดตั้ง';
  if (slipField === 'order_after_slip') return 'หลังติดตั้ง';
  const m = /^order_installment_(\d+)$/.exec(slipField || '');
  if (m) return `งวดที่ ${parseInt(m[1]) + 1}`;
  return null;
}

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Database: ${database}`);
if (database === 'solardb') console.log('⚠️  PRODUCTION DATABASE');

// Pull every payment row still missing submitted_by — keyed by lead+slip_field
const payments = (await pool.request().query(`
  SELECT id, lead_id, slip_field
  FROM payments
  WHERE submitted_at IS NULL
`)).recordset;

console.log(`Payments missing submitted_at: ${payments.length}`);

let matched = 0, skipped = 0;
for (const p of payments) {
  const needle = labelFor(p.slip_field);
  if (!needle) { skipped++; continue; }
  const act = (await pool.request()
    .input('lead_id', sql.Int, p.lead_id)
    .input('needle', sql.NVarChar(50), `%${needle}%`)
    .query(`
      SELECT TOP 1 created_by, created_at
      FROM lead_activities
      WHERE lead_id = @lead_id
        AND activity_type = 'slip_submitted'
        AND title LIKE @needle
      ORDER BY created_at ASC
    `)).recordset[0];
  if (!act) { skipped++; continue; }
  await pool.request()
    .input('id', sql.Int, p.id)
    .input('submitted_by', sql.Int, act.created_by)
    .input('submitted_at', sql.DateTime, act.created_at)
    .query(`UPDATE payments SET submitted_by = @submitted_by, submitted_at = @submitted_at WHERE id = @id AND submitted_at IS NULL`);
  matched++;
}

console.log(`Backfilled: ${matched}  ·  Skipped (no matching activity): ${skipped}`);
await pool.close();
