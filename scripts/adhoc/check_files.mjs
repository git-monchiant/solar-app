import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'master', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT DB_NAME(database_id) AS db_name, name AS logical_name, physical_name, type_desc
  FROM sys.master_files
  WHERE database_id IN (DB_ID('SolarDB'), DB_ID('SolarDb_UAT'))
  ORDER BY database_id, file_id
`);
console.log(r.recordset);
await pool.close();
