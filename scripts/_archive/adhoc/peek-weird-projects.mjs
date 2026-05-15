import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const r = await pool.request().query(`
  SELECT
    p.id,
    p.name,
    p.is_active,
    p.is_pinned,
    (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id) AS prospects,
    (SELECT COUNT(*) FROM leads l WHERE l.project_id = p.id) AS leads,
    p.created_at
  FROM projects p
  ORDER BY p.created_at DESC
`);
console.log(`Total projects: ${r.recordset.length}\n`);
console.log("ID | Name (40) | Pros | Leads | Active | Pinned | Created");
console.log("-".repeat(110));
for (const p of r.recordset) {
  const created = new Date(p.created_at).toISOString().slice(0, 10);
  console.log(`${String(p.id).padStart(3)} | ${String(p.name).slice(0, 40).padEnd(40)} | ${String(p.prospects).padStart(4)} | ${String(p.leads).padStart(5)} | ${p.is_active ? 'Y' : 'N'}     | ${p.is_pinned ? 'Y' : 'N'}     | ${created}`);
}
await pool.close();
