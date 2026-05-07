import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const targets = await pool.request().query(`
  SELECT id, name FROM projects WHERE id IN (52, 109)
`);
console.log('Source + target:', targets.recordset);

const before = await pool.request().query(`
  SELECT 'prospects' AS kind, project_id, COUNT(*) AS n FROM prospects WHERE project_id IN (52, 109) GROUP BY project_id
  UNION ALL
  SELECT 'leads', project_id, COUNT(*) FROM leads WHERE project_id IN (52, 109) GROUP BY project_id
`);
console.log('Before:', before.recordset);

const tx = pool.transaction();
await tx.begin();
try {
  const p = await tx.request().query(`UPDATE prospects SET project_id = 109 WHERE project_id = 52`);
  const l = await tx.request().query(`UPDATE leads SET project_id = 109 WHERE project_id = 52`);
  const d = await tx.request().query(`DELETE FROM projects WHERE id = 52`);
  await tx.commit();
  console.log(`Moved ${p.rowsAffected[0]} prospects, ${l.rowsAffected[0]} leads → 109. Deleted ${d.rowsAffected[0]} project (id=52).`);
} catch (e) {
  await tx.rollback();
  throw e;
}

const after = await pool.request().query(`
  SELECT id, name FROM projects WHERE id IN (52, 109)
`);
console.log('After:', after.recordset);
await pool.close();
