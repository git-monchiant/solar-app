import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});
const r = await pool.request().query(`
  SELECT column_name, data_type, character_maximum_length FROM information_schema.columns
  WHERE table_name = 'payments' AND column_name IN ('confirmed_by','submitted_by')
`);
console.table(r.recordset);
// sample distinct values
const r2 = await pool.request().query(`
  SELECT TOP 10 DISTINCT confirmed_by FROM payments WHERE confirmed_by IS NOT NULL
`);
console.table(r2.recordset);
await pool.close();
