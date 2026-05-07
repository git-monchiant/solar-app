import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const lead = await pool.request().query(`
  SELECT id, status, pre_doc_no, payment_confirmed, order_before_paid, order_total, quotation_amount, quotation_doc_no, quotation_sent_date, install_date
  FROM leads WHERE id = 611
`);
console.log('LEAD 611:'); console.table(lead.recordset);

const pays = await pool.request().query(`
  SELECT id, lead_id, step_no, slip_field, amount, confirmed_at, submitted_at
  FROM payments WHERE lead_id = 611
  ORDER BY id
`);
console.log('\nPayments for lead 611:'); console.table(pays.recordset);

await pool.close();
