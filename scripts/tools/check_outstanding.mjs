import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});
const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
try {
  const r = await pool.request().input("first_day", firstDay).query(`
    ;WITH closed_pay AS (
      SELECT lead_id, SUM(amount) AS paid
      FROM payments
      WHERE slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL
      GROUP BY lead_id
    )
    SELECT
      (SELECT COUNT(*) FROM leads WHERE created_at >= @first_day) as new_leads,
      (SELECT COUNT(*) FROM leads WHERE install_completed_at >= @first_day) as closed_count,
      (SELECT ISNULL(SUM(ISNULL(order_total,0) + ISNULL(install_extra_cost,0)), 0) FROM leads WHERE install_completed_at >= @first_day) as closed_value,
      ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0) - ISNULL(cp.paid,0)), 0) as closed_outstanding
    FROM leads l
    LEFT JOIN closed_pay cp ON cp.lead_id = l.id
    WHERE l.install_completed_at >= @first_day
  `);
  console.log(r.recordset);
} catch (e) {
  console.error('SQL error:', e.message);
}
await pool.close();
