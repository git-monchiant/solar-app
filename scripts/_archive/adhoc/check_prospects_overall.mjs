import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

console.log('=== Projects ===');
const projects = await pool.request().query(`
  SELECT p.id, p.name, p.assignee, p.is_active,
         (SELECT COUNT(*) FROM prospects x WHERE x.project_id = p.id) AS prospects
  FROM projects p
  ORDER BY p.id
`);
for (const r of projects.recordset) {
  console.log(`#${r.id}  [${r.prospects} rows]  active=${r.is_active}  assignee=${r.assignee ?? '-'}  ${r.name}`);
}

console.log('\n=== Totals ===');
const tot = await pool.request().query(`SELECT COUNT(*) AS n FROM prospects`);
console.log('Total prospects:', tot.recordset[0].n);

const orphan = await pool.request().query(`
  SELECT COUNT(*) AS n FROM prospects p LEFT JOIN projects j ON j.id = p.project_id WHERE j.id IS NULL
`);
console.log('Orphans (no project):', orphan.recordset[0].n);

console.log('\n=== Data quality per project ===');
const q = await pool.request().query(`
  SELECT project_id,
    COUNT(*) AS total,
    SUM(CASE WHEN house_number IS NULL OR LTRIM(RTRIM(house_number)) = '' THEN 1 ELSE 0 END) AS blank_house,
    SUM(CASE WHEN full_name IS NULL OR LTRIM(RTRIM(full_name)) = '' THEN 1 ELSE 0 END) AS blank_name,
    SUM(CASE WHEN phone IS NULL OR LTRIM(RTRIM(phone)) = '' THEN 1 ELSE 0 END) AS blank_phone,
    SUM(CASE WHEN phone IS NOT NULL AND LEN(phone) < 9 THEN 1 ELSE 0 END) AS short_phone,
    SUM(CASE WHEN existing_solar IS NOT NULL AND existing_solar <> '' THEN 1 ELSE 0 END) AS has_existing_solar,
    SUM(CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_to_lead,
    SUM(CASE WHEN line_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_to_line
  FROM prospects
  GROUP BY project_id
  ORDER BY project_id
`);
for (const r of q.recordset) {
  console.log(`project #${r.project_id}: total=${r.total} blank_house=${r.blank_house} blank_name=${r.blank_name} blank_phone=${r.blank_phone} short_phone=${r.short_phone} existing_solar=${r.has_existing_solar} lead=${r.mapped_to_lead} line=${r.mapped_to_line}`);
}

console.log('\n=== Duplicate (project_id, house_number) ===');
const dup = await pool.request().query(`
  SELECT project_id, house_number, COUNT(*) AS n
  FROM prospects
  WHERE house_number IS NOT NULL
  GROUP BY project_id, house_number
  HAVING COUNT(*) > 1
  ORDER BY project_id, house_number
`);
if (dup.recordset.length === 0) console.log('(none)');
else for (const r of dup.recordset) console.log(`  #${r.project_id}  ${r.house_number}  x${r.n}`);

console.log('\n=== Duplicate phones (same project) ===');
const dupPhone = await pool.request().query(`
  SELECT project_id, phone, COUNT(*) AS n
  FROM prospects
  WHERE phone IS NOT NULL AND phone <> ''
  GROUP BY project_id, phone
  HAVING COUNT(*) > 1
  ORDER BY project_id, phone
`);
if (dupPhone.recordset.length === 0) console.log('(none)');
else for (const r of dupPhone.recordset) console.log(`  #${r.project_id}  ${r.phone}  x${r.n}`);

console.log('\n=== Sample row per project ===');
for (const p of projects.recordset) {
  const s = await pool.request().input('pid', sql.Int, p.id).query(`
    SELECT TOP 2 seq, house_number, full_name, phone, app_status, existing_solar, installed_kw, installed_product, ev_charger
    FROM prospects WHERE project_id = @pid ORDER BY seq, id
  `);
  console.log(`-- project #${p.id} ${p.name}`);
  for (const r of s.recordset) console.log('   ', JSON.stringify(r));
}

await pool.close();
