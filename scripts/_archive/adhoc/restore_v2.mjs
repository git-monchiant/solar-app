import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'master', options: { encrypt: false, trustServerCertificate: true } });
const bak = `C:\\Program Files\\Microsoft SQL Server\\MSSQL14.MSSQLSERVER\\MSSQL\\Backup\\SolarDB_copy.bak`;

try {
  await pool.request().query(`ALTER DATABASE SolarDb_UAT SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
} catch (e) { console.log('single_user err:', e.message); }

try {
  await pool.request().query(`
    RESTORE DATABASE SolarDb_UAT FROM DISK = N'${bak}'
    WITH REPLACE, RECOVERY,
      MOVE 'SolarDB' TO N'C:\\Program Files\\Microsoft SQL Server\\MSSQL14.MSSQLSERVER\\MSSQL\\DATA\\SolarDb_UAT.mdf',
      MOVE 'SolarDB_log' TO N'C:\\Program Files\\Microsoft SQL Server\\MSSQL14.MSSQLSERVER\\MSSQL\\DATA\\SolarDb_UAT_log.ldf'
  `);
  console.log('RESTORE ok');
} catch (e) {
  console.log('err:', e.message);
  if (e.precedingErrors) {
    for (const pe of e.precedingErrors) console.log('  preceding:', pe.message);
  }
  if (e.info) console.log('  info:', JSON.stringify(e.info));
}

try {
  await pool.request().query(`ALTER DATABASE SolarDb_UAT SET MULTI_USER`);
} catch (e) { console.log('multi_user err:', e.message); }
await pool.close();
