import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT TOP 3 l.id, l.order_total, l.order_pct_before, l.order_pct_after, l.order_installments
  FROM leads l
  WHERE l.order_installments IS NOT NULL
    AND LEN(l.order_installments) > 50
    AND l.order_installments LIKE '%after%'
  ORDER BY l.updated_at DESC
`);
for (const row of r.recordset) {
  console.log(`=== Lead ${row.id} ===`);
  console.log(`order_total: ${row.order_total}`);
  console.log(`pct_before: ${row.order_pct_before} | pct_after: ${row.order_pct_after}`);
  console.log(`order_installments (raw JSON):`);
  console.log(row.order_installments);
  try {
    const parsed = JSON.parse(row.order_installments);
    console.log(`parsed (${parsed.length} งวด):`);
    parsed.forEach((p, i) => console.log(`  งวด ${i+1}: ${JSON.stringify(p)}`));
  } catch {}
  console.log("");
}

// Also show payments table for one of them
if (r.recordset.length > 0) {
  const leadId = r.recordset[0].id;
  console.log(`=== payments table for lead ${leadId} ===`);
  const p = await pool.request().input("id", sql.Int, leadId).query(`
    SELECT id, step_no, slip_field, amount, payment_method, confirmed_at, slip_url
    FROM payments WHERE lead_id = @id ORDER BY step_no
  `);
  for (const pp of p.recordset) {
    console.log(`  step=${pp.step_no} field=${pp.slip_field} amount=${pp.amount} method=${pp.payment_method} confirmed=${pp.confirmed_at ?? '-'}`);
  }
}
await pool.close();
