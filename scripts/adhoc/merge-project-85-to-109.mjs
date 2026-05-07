import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const targets = await pool.request().query(`SELECT id, name FROM projects WHERE id IN (85, 109)`);
console.log('Source + target:', targets.recordset);

const tx = pool.transaction();
await tx.begin();
try {
  const p = await tx.request().query(`UPDATE prospects SET project_id = 109 WHERE project_id = 85`);
  const l = await tx.request().query(`UPDATE leads SET project_id = 109 WHERE project_id = 85`);
  const d = await tx.request().query(`DELETE FROM projects WHERE id = 85`);
  await tx.commit();
  console.log(`Moved ${p.rowsAffected[0]} prospects, ${l.rowsAffected[0]} leads → 109. Deleted ${d.rowsAffected[0]} project (id=85).`);
} catch (e) {
  await tx.rollback();
  throw e;
}
await pool.close();
