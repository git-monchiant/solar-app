import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'master', options: { encrypt: false, trustServerCertificate: true } });
const bak = `C:\\Program Files\\Microsoft SQL Server\\MSSQL14.MSSQLSERVER\\MSSQL\\Backup\\SolarDB_copy.bak`;

console.log('1/4 BACKUP SolarDB ...');
try {
  await pool.request().query(`BACKUP DATABASE SolarDB TO DISK = N'${bak}' WITH COPY_ONLY, INIT, COMPRESSION`);
  console.log('   ok');
} catch (e) { console.log('   err:', e.message); process.exit(1); }

console.log('2/4 Set SolarDb_UAT → SINGLE_USER ...');
try {
  await pool.request().query(`ALTER DATABASE SolarDb_UAT SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
  console.log('   ok');
} catch (e) { console.log('   err:', e.message); process.exit(1); }

console.log('3/4 RESTORE onto SolarDb_UAT ...');
try {
  await pool.request().query(`
    RESTORE DATABASE SolarDb_UAT FROM DISK = N'${bak}'
    WITH REPLACE,
      MOVE 'SolarDB' TO N'C:\\Program Files\\Microsoft SQL Server\\MSSQL14.MSSQLSERVER\\MSSQL\\DATA\\SolarDb_UAT.mdf',
      MOVE 'SolarDB_log' TO N'C:\\Program Files\\Microsoft SQL Server\\MSSQL14.MSSQLSERVER\\MSSQL\\DATA\\SolarDb_UAT_log.ldf'
  `);
  console.log('   ok');
} catch (e) { console.log('   err:', e.message); }

console.log('4/4 Set SolarDb_UAT → MULTI_USER ...');
try {
  await pool.request().query(`ALTER DATABASE SolarDb_UAT SET MULTI_USER`);
  console.log('   ok');
} catch (e) { console.log('   err:', e.message); }

// Verify
const check = await pool.request().query(`SELECT name, state_desc FROM sys.databases WHERE name = 'SolarDb_UAT'`);
console.log('State:', check.recordset);
await pool.close();
