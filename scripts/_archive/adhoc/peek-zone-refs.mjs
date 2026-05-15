import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
// How many rows reference each old zone?
for (const z of ['กรุงเทพ ทีม 1', 'กรุงเทพ ทีม 2', 'กรุงเทพ ทีม 3']) {
  const leads = await pool.request().input('z', sql.NVarChar, z).query(`SELECT COUNT(*) AS n FROM leads WHERE zone = @z`);
  console.log(`${z}: leads=${leads.recordset[0].n}`);
}
// Check other tables that might reference zones
const tables = await pool.request().query(`
  SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE COLUMN_NAME = 'zone' OR COLUMN_NAME = 'zone_name' OR COLUMN_NAME = 'zone_id'
  ORDER BY TABLE_NAME
`);
console.log('\nTables with zone columns:');
console.table(tables.recordset);
await pool.close();
