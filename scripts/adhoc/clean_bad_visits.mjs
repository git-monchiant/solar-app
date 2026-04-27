import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const before = await pool.request().query(`
  SELECT COUNT(*) AS n FROM prospects
  WHERE interest IS NULL AND visited_by IS NULL AND (note = '' OR note IS NULL)
    AND (visited_at IS NOT NULL OR visit_count > 0 OR note = '')
`);
console.log('rows to clean:', before.recordset[0].n);

const r = await pool.request().query(`
  UPDATE prospects
  SET visited_at = NULL, visit_count = 0, note = NULL, updated_at = GETDATE()
  WHERE interest IS NULL AND visited_by IS NULL AND (note = '' OR note IS NULL)
    AND (visited_at IS NOT NULL OR visit_count > 0 OR note = '')
`);
console.log('cleaned:', r.rowsAffected[0]);

const after = await pool.request().query(`
  SELECT COUNT(*) AS n FROM prospects WHERE visited_at IS NOT NULL OR visit_count > 0
`);
console.log('remaining with visits:', after.recordset[0].n);
await pool.close();
