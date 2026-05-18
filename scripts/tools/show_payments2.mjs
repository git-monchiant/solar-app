import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const p = await pool.request().input("id", sql.Int, 463).query(`
  SELECT id, lead_id, step_no, slip_field, doc_no, amount, description, payment_method, confirmed_at, discount_pct, discount_amount, cc_surcharge_pct, cc_surcharge_amount
  FROM payments WHERE lead_id = @id ORDER BY step_no
`);
for (const row of p.recordset) {
  const compact = Object.fromEntries(Object.entries(row).filter(([_,v]) => v != null));
  console.log(JSON.stringify(compact));
}
await pool.close();
