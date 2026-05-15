import sql from 'mssql';
const config = {
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'solardb', options: { encrypt: false, trustServerCertificate: true },
};
const pool = await sql.connect(config);

// Full wipe: transactions, staging files, slip URLs and paid flags on leads.
const t = await pool.request().query(`DELETE FROM payments`);
console.log(`payments: deleted ${t.rowsAffected[0]} transaction row(s)`);

const s = await pool.request().query(`DELETE FROM slip_files`);
console.log(`slip_files: deleted ${s.rowsAffected[0]} staging row(s)`);

const l = await pool.request().query(`
  UPDATE leads SET
    pre_slip_url = NULL,
    order_before_slip = NULL,
    order_after_slip = NULL,
    payment_confirmed = 0,
    order_before_paid = 0,
    order_after_paid = 0,
    updated_at = GETDATE()
  WHERE pre_slip_url IS NOT NULL
     OR order_before_slip IS NOT NULL
     OR order_after_slip IS NOT NULL
     OR payment_confirmed = 1
     OR order_before_paid = 1
     OR order_after_paid = 1
`);
console.log(`leads: cleared slip URLs + paid flags on ${l.rowsAffected[0]} row(s)`);

const sum = await pool.request().query(`
  SELECT
    (SELECT COUNT(*) FROM payments) as payments,
    (SELECT COUNT(*) FROM slip_files) as slip_files,
    (SELECT COUNT(*) FROM leads WHERE pre_slip_url IS NOT NULL OR order_before_slip IS NOT NULL OR order_after_slip IS NOT NULL) as leads_with_any_slip,
    (SELECT COUNT(*) FROM leads WHERE payment_confirmed = 1 OR order_before_paid = 1 OR order_after_paid = 1) as leads_any_paid
`);
console.log(sum.recordset[0]);

await pool.close();
