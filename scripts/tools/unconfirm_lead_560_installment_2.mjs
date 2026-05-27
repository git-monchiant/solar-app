// Lead 560 (คุณพิมพ์รำไพ วีระโอฬารกุล) — un-confirm installment 2 payment.
// Row: payment id=226, slip_field='order_installment_1', amount=106,264.
// Scope: NULL out confirmed_at + confirmed_by. Row stays so the slip URL
// + amount + history remain auditable; lead can re-confirm later.
//
// Default = solardb_dev + dry-run. Use --db=solardb --yes for prod.
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const execute = args.includes('--yes');
const PAYMENT_ID = 226;
const EXPECTED_LEAD = 560;
const EXPECTED_FIELD = 'order_installment_1';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database, options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database} · Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

const before = await pool.request().query(`
  SELECT id, lead_id, slip_field, amount, confirmed_at, confirmed_by, description
  FROM payments WHERE id = ${PAYMENT_ID}
`);
if (before.recordset.length === 0) { console.log('not found'); process.exit(1); }
console.log('--- before ---');
console.table(before.recordset);

const r = before.recordset[0];
if (r.lead_id !== EXPECTED_LEAD || r.slip_field !== EXPECTED_FIELD) {
  console.log(`\n❌ Row sanity check failed — expected lead ${EXPECTED_LEAD} + field ${EXPECTED_FIELD}, got ${r.lead_id} / ${r.slip_field}. Aborting.`);
  await pool.close(); process.exit(1);
}
if (r.confirmed_at == null) {
  console.log('\n⚠️  Already unconfirmed — no-op.');
  await pool.close(); process.exit(0);
}

if (!execute) {
  console.log('\nDry-run only — pass --yes to apply.');
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  await new sql.Request(tx).input('id', sql.Int, PAYMENT_ID).query(`
    UPDATE payments SET confirmed_at = NULL, confirmed_by = NULL WHERE id = @id
  `);
  await tx.commit();
  const after = await pool.request().query(`
    SELECT id, lead_id, slip_field, amount, confirmed_at, confirmed_by, description
    FROM payments WHERE id = ${PAYMENT_ID}
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
