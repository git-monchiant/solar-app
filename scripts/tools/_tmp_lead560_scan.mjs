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
  SELECT id, full_name, status,
         quotation_amount, quotation_doc_no, quotation_by,
         order_total, order_discount_amount,
         install_date, install_completed_at
  FROM leads WHERE id = @id
`);
if (r.recordset.length === 0) { console.log('not found'); process.exit(1); }
console.table(r.recordset);
await pool.close();
