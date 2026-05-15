import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const before = await pool.request().query(`SELECT id, name FROM projects WHERE id IN (50, 51)`);
console.log('Before:', before.recordset);

const refs = await pool.request().query(`
  SELECT 50 AS pid, (SELECT COUNT(*) FROM prospects WHERE project_id = 50) AS prospects, (SELECT COUNT(*) FROM leads WHERE project_id = 50) AS leads
  UNION ALL
  SELECT 51, (SELECT COUNT(*) FROM prospects WHERE project_id = 51), (SELECT COUNT(*) FROM leads WHERE project_id = 51)
`);
console.log('Refs:', refs.recordset);

const total = refs.recordset.reduce((s, r) => s + r.prospects + r.leads, 0);
if (total > 0) {
  console.error('REFUSING: project 50/51 still referenced. Aborting.');
  process.exit(1);
}

const r = await pool.request().query(`DELETE FROM projects WHERE id IN (50, 51)`);
console.log(`Deleted ${r.rowsAffected[0]} projects`);
await pool.close();
