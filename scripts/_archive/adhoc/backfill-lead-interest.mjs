import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const before = await pool.request().query(`
  SELECT
    SUM(CASE WHEN interest = 'interested' THEN 1 ELSE 0 END) AS interested,
    SUM(CASE WHEN interest IS NULL OR interest <> 'interested' THEN 1 ELSE 0 END) AS not_interested_yet
  FROM prospects WHERE lead_id IS NOT NULL
`);
console.log('Before (lead_id NOT NULL):', before.recordset[0]);

const r = await pool.request().query(`
  UPDATE prospects
  SET interest = 'interested'
  WHERE lead_id IS NOT NULL AND (interest IS NULL OR interest <> 'interested')
`);
console.log(`Updated ${r.rowsAffected[0]} prospects → interest = 'interested'`);

const after = await pool.request().query(`
  SELECT
    SUM(CASE WHEN interest = 'interested' THEN 1 ELSE 0 END) AS interested,
    SUM(CASE WHEN interest IS NULL OR interest <> 'interested' THEN 1 ELSE 0 END) AS still_off
  FROM prospects WHERE lead_id IS NOT NULL
`);
console.log('After:', after.recordset[0]);
await pool.close();
