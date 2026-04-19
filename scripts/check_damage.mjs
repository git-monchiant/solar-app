import sql from 'mssql';
const config = {
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'solardb', options: { encrypt: false, trustServerCertificate: true },
};
const pool = await sql.connect(config);

// Find leads that had 'payment_confirmed' activities (i.e. were truly paid at some point)
const r = await pool.request().query(`
  SELECT DISTINCT l.id, l.full_name, l.status,
         la.created_at as paid_at,
         la.note as slip_note
  FROM lead_activities la
  JOIN leads l ON l.id = la.lead_id
  WHERE la.activity_type = 'payment_confirmed'
  ORDER BY la.created_at DESC
`);
console.log(`leads with payment_confirmed activity:`, r.recordset);

await pool.close();
