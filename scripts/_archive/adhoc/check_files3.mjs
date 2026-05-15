import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'master', options: { encrypt: false, trustServerCertificate: true } });
try {
  const r = await pool.request().query(`USE SolarDB; SELECT name, physical_name, type_desc FROM sys.database_files;`);
  console.log('SolarDB:', r.recordset);
} catch (e) { console.log('SolarDB err:', e.message); }
try {
  const r = await pool.request().query(`USE SolarDb_UAT; SELECT name, physical_name, type_desc FROM sys.database_files;`);
  console.log('SolarDb_UAT:', r.recordset);
} catch (e) { console.log('UAT err:', e.message); }
await pool.close();
