import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

console.log('=== leads — fields that may depend on quotation amount ===');
const lead = await pool.request().query(`
  SELECT id, quotation_amount, order_total, order_pct_before, order_pct_after,
         order_discount_pct, order_discount_amount,
         pre_total_price, pre_pay_amount, install_extra_cost
  FROM leads WHERE id = 658
`);
console.table(lead.recordset);

console.log('\n=== payments — any amount tied to lead 658 ===');
const pay = await pool.request().query(`
  SELECT id, slip_field, amount, submitted_at, confirmed_at, method
  FROM payments WHERE lead_id = 658 ORDER BY id
`);
console.table(pay.recordset);

console.log('\n=== payment_logs (if any) ===');
const logs = await pool.request().query(`
  SELECT TOP 10 * FROM payment_logs WHERE lead_id = 658 ORDER BY created_at DESC
`);
console.table(logs.recordset);

await pool.close();
