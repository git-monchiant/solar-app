import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});

const bookingPaid = await pool.request().query(`
  SELECT COUNT(*) AS n FROM leads l
  WHERE EXISTS (SELECT 1 FROM payments p WHERE p.lead_id=l.id AND p.slip_field='pre_slip_url' AND p.confirmed_at IS NOT NULL)
`);
console.log('booking_paid total:', bookingPaid.recordset[0].n);

const breakdown = await pool.request().query(`
  WITH bp AS (
    SELECT l.id, l.status, l.survey_date, l.install_date, l.install_completed_at
    FROM leads l
    WHERE EXISTS (SELECT 1 FROM payments p2 WHERE p2.lead_id=l.id AND p2.slip_field='pre_slip_url' AND p2.confirmed_at IS NOT NULL)
  )
  SELECT status,
    COUNT(*) AS n,
    SUM(CASE WHEN survey_date > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS survey_future,
    SUM(CASE WHEN survey_date <= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS survey_past,
    SUM(CASE WHEN install_date > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS install_future,
    SUM(CASE WHEN install_date <= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS install_past,
    SUM(CASE WHEN install_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS install_done
  FROM bp
  GROUP BY status
  ORDER BY status
`);
console.table(breakdown.recordset);

await pool.close();
