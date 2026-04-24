import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  UPDATE payments SET payment_method = 'other'
  WHERE payment_method IS NULL AND description LIKE N'%ชำระโดย:%'
`);
console.log('rows affected:', r.rowsAffected);
const after = await pool.request().query(`SELECT id, lead_id, payment_method, description FROM payments WHERE payment_method = 'other'`);
console.log('after:', JSON.stringify(after.recordset, null, 2));
await pool.close();
