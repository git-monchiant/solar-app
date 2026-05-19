// Backfill payments.confirmed_by (NVARCHAR — stores the user's full name)
// for rows that have confirmed_at but no confirmed_by. The actor lives in
// the matching `payment_confirmed` activity in lead_activities — pair by
// lead + slip_field label + nearest created_at to confirmed_at.
//
// Idempotent: only touches rows where confirmed_by IS NULL.
//
// Usage:
//   node scripts/migrations/011_backfill_payments_confirmed_by.mjs --db=solardb_dev
//   node scripts/migrations/011_backfill_payments_confirmed_by.mjs --db=solardb

import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db='));
if (!dbArg) {
  console.error('Usage: node 011_backfill_payments_confirmed_by.mjs --db=<solardb|solardb_dev>');
  process.exit(1);
}
const database = dbArg.split('=')[1];

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

const payments = (await pool.request().query(`
  SELECT id, lead_id, slip_field, confirmed_at
  FROM payments
  WHERE confirmed_at IS NOT NULL AND (confirmed_by IS NULL OR confirmed_by = '')
`)).recordset;

console.log(`Payments missing confirmed_by: ${payments.length}`);

let matched = 0, skipped = 0;
for (const p of payments) {
  const needle = labelFor(p.slip_field);
  if (!needle) { skipped++; continue; }
  const act = (await pool.request()
    .input('lead_id', sql.Int, p.lead_id)
    .input('needle', sql.NVarChar(100), `%${needle}%`)
    .query(`
      SELECT TOP 1 u.full_name
      FROM lead_activities a
      INNER JOIN users u ON u.id = a.created_by
      WHERE a.lead_id = @lead_id
        AND a.activity_type = 'payment_confirmed'
        AND a.title LIKE @needle
      ORDER BY a.created_at DESC
    `)).recordset[0];
  if (!act?.full_name) { skipped++; continue; }
  await pool.request()
    .input('id', sql.Int, p.id)
    .input('confirmed_by', sql.NVarChar(200), act.full_name)
    .query(`UPDATE payments SET confirmed_by = @confirmed_by WHERE id = @id AND (confirmed_by IS NULL OR confirmed_by = '')`);
  matched++;
}

console.log(`Backfilled: ${matched}  ·  Skipped (no match): ${skipped}`);
await pool.close();
