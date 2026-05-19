import sql from 'mssql';
const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb_dev', options:{encrypt:false,trustServerCertificate:true}});

// Fetch lifecycle data the same way the dashboard does
const url = `${process.env.API || 'http://localhost:3000'}/api/lifecycle`;
console.log('Fetching from:', url);

// Or just query the bits we need directly
const r = await pool.request().query(`
  SELECT
    -- Total
    (SELECT COUNT(*) FROM leads) as total,
    -- Contacted Yes (any contact yes via activities or slip-fallback)
    (SELECT COUNT(DISTINCT lead_id) FROM lead_activities
      WHERE (title LIKE N'ติดต่อได้%'
             OR activity_type IN ('call','visit','line','line_sent','loan_followup'))
    ) AS contact_yes_via_activity,
    -- Has pre_slip submitted (fallback for contacted)
    (SELECT COUNT(DISTINCT lead_id) FROM payments
      WHERE slip_field='pre_slip_url' AND submitted_at IS NOT NULL) AS contact_yes_via_slip
`);
console.table(r.recordset);

// Status breakdown for contacted leads
const r2 = await pool.request().query(`
  ;WITH contacted AS (
    SELECT DISTINCT l.id, l.status FROM leads l
    WHERE EXISTS (SELECT 1 FROM lead_activities a
                  WHERE a.lead_id = l.id
                    AND (a.title LIKE N'ติดต่อได้%'
                         OR a.activity_type IN ('call','visit','line','line_sent','loan_followup')))
       OR EXISTS (SELECT 1 FROM payments p
                  WHERE p.lead_id = l.id AND p.slip_field='pre_slip_url' AND p.submitted_at IS NOT NULL)
  )
  SELECT status, COUNT(*) AS n FROM contacted GROUP BY status ORDER BY status
`);
console.log('Contacted (yes) leads by status:');
console.table(r2.recordset);

await pool.close();
