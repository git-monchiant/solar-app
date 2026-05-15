import sql from 'mssql';

const config = {
  server: '172.41.1.73',
  port: 1433,
  user: 'monchiant',
  password: 'monchiant',
  database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
};

const pool = await sql.connect(config);

// Backfill assigned_user_id = author of the most recent activity (any type).
const r = await pool.request().query(`
  UPDATE l
  SET l.assigned_user_id = la.created_by,
      l.updated_at = GETDATE()
  FROM leads l
  CROSS APPLY (
    SELECT TOP 1 created_by
    FROM lead_activities
    WHERE lead_id = l.id
      AND created_by IS NOT NULL
    ORDER BY created_at DESC
  ) la
  WHERE l.assigned_user_id IS NULL OR l.assigned_user_id <> la.created_by;

  SELECT @@ROWCOUNT as updated;
`);
console.log(`Leads owner backfilled: ${r.recordset[0].updated}`);

// Show summary
const s = await pool.request().query(`
  SELECT u.full_name, COUNT(*) as leads
  FROM leads l
  LEFT JOIN users u ON l.assigned_user_id = u.id
  WHERE l.assigned_user_id IS NOT NULL
  GROUP BY u.full_name
  ORDER BY leads DESC;
`);
console.table(s.recordset);

const noOwner = await pool.request().query(`SELECT COUNT(*) as n FROM leads WHERE assigned_user_id IS NULL`);
console.log(`Leads without owner: ${noOwner.recordset[0].n}`);

await pool.close();
