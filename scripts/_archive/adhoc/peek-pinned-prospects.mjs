import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const master = await pool.request().query(`SELECT id, name, is_pinned FROM projects WHERE is_pinned = 1`);
console.log('Master project (pinned):', master.recordset);

const prospects = await pool.request().query(`
  SELECT TOP 10 id, project_id, project_name, house_number, full_name
  FROM prospects WHERE project_id = 109
  ORDER BY updated_at DESC
`);
console.log(`\nProspects under project_id=109 (${prospects.recordset.length} shown):`);
for (const p of prospects.recordset) {
  console.log(`  #${p.id}  house=${p.house_number||'-'}  name=${p.full_name||'-'}  project_name="${p.project_name||''}"`);
}
await pool.close();
