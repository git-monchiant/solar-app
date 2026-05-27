import sql from 'mssql';
const dbArg = process.argv.slice(2).find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database, options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database}\n`);
const r = await pool.request().input('id', sql.Int, 560).query(`
  SELECT id, lead_id, slip_field, amount, confirmed_at, confirmed_by, created_at, description
  FROM payments WHERE lead_id = @id
  ORDER BY id
`);
console.table(r.recordset);
await pool.close();
