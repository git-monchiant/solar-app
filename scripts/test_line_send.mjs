import sql from 'mssql';
const config = {
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'solardb', options: { encrypt: false, trustServerCertificate: true },
};
const pool = await sql.connect(config);
const r = await pool.request().query(`
  SELECT id, name, phase, has_battery, is_upgrade, price
  FROM packages
  WHERE is_upgrade = 1
  ORDER BY phase, price
`);
console.log(`upgrade packages: ${r.recordset.length}`);
console.table(r.recordset);

const all = await pool.request().query(`SELECT COUNT(*) total, SUM(CASE WHEN is_upgrade=1 THEN 1 ELSE 0 END) upg FROM packages`);
console.log(all.recordset);
await pool.close();
