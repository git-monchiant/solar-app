import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const before = await pool.request().query(`
  SELECT
    SUM(CASE WHEN channels IS NULL OR channels = N'' OR channels = N'[]' THEN 1 ELSE 0 END) AS no_tag,
    COUNT(*) AS total
  FROM prospects
`);
console.log('Before:', before.recordset[0]);

const r = await pool.request().query(`
  UPDATE prospects
  SET channels = N'["senxpm"]',
      channel  = COALESCE(channel, N'senxpm')
  WHERE channels IS NULL OR channels = N'' OR channels = N'[]'
`);
console.log(`Updated ${r.rowsAffected[0]} rows to senxpm`);

const after = await pool.request().query(`
  SELECT
    SUM(CASE WHEN channels IS NULL OR channels = N'' OR channels = N'[]' THEN 1 ELSE 0 END) AS no_tag,
    SUM(CASE WHEN channels = N'["senxpm"]' THEN 1 ELSE 0 END) AS senxpm_only,
    COUNT(*) AS total
  FROM prospects
`);
console.log('After:', after.recordset[0]);
await pool.close();
