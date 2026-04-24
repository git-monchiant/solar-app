import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const l = await pool.request().query(`
  SELECT id, full_name, status, order_total, order_pct_before, order_before_paid, order_before_slip, order_after_paid, order_after_slip
  FROM leads WHERE id = 12
`);
console.log('Lead:', JSON.stringify(l.recordset, null, 2));
const p = await pool.request().query(`
  SELECT id, lead_id, step_no, slip_field, amount, description, payment_method, confirmed_at, confirmed_by
  FROM payments WHERE lead_id = 12 ORDER BY confirmed_at DESC
`);
console.log('Payments:', JSON.stringify(p.recordset, null, 2));
await pool.close();
