import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const id = 542;

const lead = await pool.request().input("id", sql.Int, id).query(`
  SELECT id, full_name, status, pre_doc_no, pre_total_price, pre_booked_at,
         order_total, order_pct_before, order_installments,
         install_extra_cost, install_completed_at
  FROM leads WHERE id=@id
`);
console.log("LEAD 542:");
console.dir(lead.recordset[0], { depth: null });

const pmts = await pool.request().input("id", sql.Int, id).query(`
  SELECT id, slip_field, amount, confirmed_at, description
  FROM payments WHERE lead_id=@id ORDER BY slip_field
`);
console.log(`\nPAYMENTS (${pmts.recordset.length}):`);
for (const p of pmts.recordset) {
  console.log(`  ${p.slip_field}  amount=${p.amount}  confirmed_at=${p.confirmed_at}  desc=${p.description||''}`);
}
await pool.close();
