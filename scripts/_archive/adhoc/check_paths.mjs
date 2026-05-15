import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'master', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT
    SERVERPROPERTY('InstanceDefaultBackupPath') AS BackupPath,
    SERVERPROPERTY('InstanceDefaultDataPath') AS DataPath,
    SERVERPROPERTY('InstanceDefaultLogPath') AS LogPath,
    SERVERPROPERTY('ProductVersion') AS Version
`);
console.log(r.recordset);
const dbs = await pool.request().query(`SELECT name, state_desc FROM sys.databases WHERE name IN ('solardb', 'solardb_uat')`);
console.log('Databases:', dbs.recordset);
await pool.close();
