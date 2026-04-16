import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

// 1. Fill quotation_amount from order_total where null
let r1 = await pool.request().query(`
  UPDATE leads SET quotation_amount = order_total
  WHERE quotation_amount IS NULL AND order_total IS NOT NULL
    AND status IN ('quote','order','install','closed')
`);
console.log(`quotation_amount backfilled: ${r1.rowsAffected[0]} rows`);

// 2. Default quotation_amount to 200000 for advanced leads still null
let r2 = await pool.request().query(`
  UPDATE leads SET quotation_amount = 200000
  WHERE quotation_amount IS NULL
    AND status IN ('order','install','closed')
`);
console.log(`quotation_amount default 200k: ${r2.rowsAffected[0]} rows`);

// 3. Default order_total to quotation_amount where null
let r3 = await pool.request().query(`
  UPDATE leads SET order_total = quotation_amount
  WHERE order_total IS NULL AND quotation_amount IS NOT NULL
    AND status IN ('order','install','closed')
`);
console.log(`order_total backfilled from quotation: ${r3.rowsAffected[0]} rows`);

// 4. Default order_pct_before = 50 for leads at order+ without split
let r4 = await pool.request().query(`
  UPDATE leads SET order_pct_before = 50
  WHERE order_pct_before IS NULL
    AND status IN ('order','install','closed')
`);
console.log(`order_pct_before default 50%: ${r4.rowsAffected[0]} rows`);

// 5. Mark order_before_paid = true for leads that have passed to install/closed
let r5 = await pool.request().query(`
  UPDATE leads SET order_before_paid = 1
  WHERE order_before_paid = 0
    AND status IN ('install','closed')
`);
console.log(`order_before_paid set true: ${r5.rowsAffected[0]} rows`);

// 6. order_after_paid for closed leads
let r6 = await pool.request().query(`
  UPDATE leads SET order_after_paid = 1
  WHERE (order_after_paid = 0 OR order_after_paid IS NULL)
    AND status = 'closed'
`);
console.log(`order_after_paid set true for closed: ${r6.rowsAffected[0]} rows`);

// 7. install_completed_at for closed leads without timestamp
let r7 = await pool.request().query(`
  UPDATE leads SET install_completed_at = COALESCE(install_date, GETDATE())
  WHERE install_completed_at IS NULL AND status = 'closed'
`);
console.log(`install_completed_at backfilled for closed: ${r7.rowsAffected[0]} rows`);

// Show results
const check = await pool.request().query(`
  SELECT id, full_name, status, quotation_amount, order_total, order_pct_before, order_before_paid, order_after_paid, install_completed_at
  FROM leads WHERE status IN ('quote','order','install','closed') ORDER BY id
`);
console.log('\nFinal state:');
console.log(JSON.stringify(check.recordset, null, 2));

await pool.close();
