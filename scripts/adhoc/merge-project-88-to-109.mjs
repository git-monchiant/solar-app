import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const before = await pool.request().query(`
  SELECT 'prospects' AS kind, COUNT(*) AS n FROM prospects WHERE project_id = 88
  UNION ALL
  SELECT 'leads', COUNT(*) FROM leads WHERE project_id = 88
`);
console.log('Before (project 88):', before.recordset);

const tx = pool.transaction();
await tx.begin();
try {
  const p = await tx.request().query(`UPDATE prospects SET project_id = 109 WHERE project_id = 88`);
  const l = await tx.request().query(`UPDATE leads SET project_id = 109 WHERE project_id = 88`);
  const d = await tx.request().query(`DELETE FROM projects WHERE id = 88`);
  await tx.commit();
  console.log(`Moved ${p.rowsAffected[0]} prospects, ${l.rowsAffected[0]} leads → 109. Deleted ${d.rowsAffected[0]} project (id=88).`);
} catch (e) {
  await tx.rollback();
  throw e;
}
await pool.close();
