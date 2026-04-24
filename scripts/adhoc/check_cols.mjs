import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT name, system_type_id, max_length, precision, scale, TYPE_NAME(system_type_id) as type_name
  FROM sys.columns
  WHERE object_id = OBJECT_ID('leads')
    AND name IN ('quotation_amount', 'order_total', 'pre_total_price', 'order_pct_before', 'order_pct_after')
`);
console.log(r.recordset);
await pool.close();
