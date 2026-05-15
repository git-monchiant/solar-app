import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

console.log('\n=== USERS ===');
const u = (await pool.request().query(`SELECT id, username, full_name, roles, is_active FROM users ORDER BY id`)).recordset;
for (const x of u) console.log(`  #${x.id} ${x.username.padEnd(14)} roles=${x.roles}  active=${x.is_active}  ${x.full_name}`);
// Validate roles JSON
let badRoles = 0;
for (const x of u) {
  if (!x.roles) { console.log(`  ⚠ #${x.id} ${x.username} has NULL roles`); badRoles++; continue; }
  try { const p = JSON.parse(x.roles); if (!Array.isArray(p) || p.length === 0) { console.log(`  ⚠ #${x.id} ${x.username} empty roles`); badRoles++; } } catch { console.log(`  ⚠ #${x.id} invalid JSON`); badRoles++; }
}
console.log(`  → ${u.length} users, ${badRoles} with role issues`);

console.log('\n=== PROJECTS ===');
const pr = (await pool.request().query(`
  SELECT p.id, p.name, p.is_active, p.assignee,
    (SELECT COUNT(*) FROM prospects x WHERE x.project_id = p.id) AS n
  FROM projects p ORDER BY p.id
`)).recordset;
for (const x of pr) console.log(`  #${x.id} active=${x.is_active}  prospects=${x.n}  assignee=${x.assignee ?? '-'}  ${x.name}`);
const activeProjectsWithoutProspects = pr.filter(x => x.is_active && x.n === 0).length;
console.log(`  → ${pr.length} projects; active+empty = ${activeProjectsWithoutProspects}`);

console.log('\n=== PROSPECTS ===');
const pt = (await pool.request().query(`
  SELECT COUNT(*) AS total,
    SUM(CASE WHEN contacts IS NULL THEN 1 ELSE 0 END) AS no_contacts,
    SUM(CASE WHEN full_name IS NULL OR full_name = '' THEN 1 ELSE 0 END) AS no_name,
    SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS no_project,
    SUM(CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) AS with_lead,
    SUM(CASE WHEN line_id IS NOT NULL THEN 1 ELSE 0 END) AS with_line,
    SUM(CASE WHEN visited_at IS NOT NULL THEN 1 ELSE 0 END) AS visited,
    SUM(CASE WHEN interest IS NOT NULL THEN 1 ELSE 0 END) AS with_interest
  FROM prospects
`)).recordset[0];
console.log(`  total=${pt.total}  no_contacts=${pt.no_contacts}  no_name=${pt.no_name}  no_project=${pt.no_project}`);
console.log(`  with_lead=${pt.with_lead}  with_line=${pt.with_line}  visited=${pt.visited}  with_interest=${pt.with_interest}`);

// Duplicate (project,house) — should be 0 now (unique index)
const dup = (await pool.request().query(`
  SELECT COUNT(*) AS n FROM (SELECT project_id, house_number FROM prospects WHERE project_id IS NOT NULL AND house_number IS NOT NULL GROUP BY project_id, house_number HAVING COUNT(*) > 1) t
`)).recordset[0].n;
console.log(`  duplicate (project_id, house_number): ${dup}`);

// Invalid contacts JSON
const bad = (await pool.request().query(`
  SELECT COUNT(*) AS n FROM prospects WHERE contacts IS NOT NULL AND ISJSON(contacts) = 0
`)).recordset[0].n;
console.log(`  invalid contacts JSON: ${bad}`);

console.log('\n=== LEADS ===');
const l = (await pool.request().query(`
  SELECT COUNT(*) total,
    SUM(CASE WHEN status = 'pre_survey' THEN 1 ELSE 0 END) pre_survey,
    SUM(CASE WHEN status = 'survey' THEN 1 ELSE 0 END) survey,
    SUM(CASE WHEN status = 'quote' THEN 1 ELSE 0 END) quote,
    SUM(CASE WHEN status = 'order' THEN 1 ELSE 0 END) 'order',
    SUM(CASE WHEN status = 'install' THEN 1 ELSE 0 END) install,
    SUM(CASE WHEN status = 'warranty' THEN 1 ELSE 0 END) warranty,
    SUM(CASE WHEN status = 'gridtie' THEN 1 ELSE 0 END) gridtie,
    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) closed
  FROM leads
`)).recordset[0];
console.log('  ', l);

// Orphan refs
const orphanLeadAct = (await pool.request().query(`
  SELECT COUNT(*) n FROM lead_activities la WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = la.lead_id)
`)).recordset[0].n;
const orphanLeadPay = (await pool.request().query(`
  SELECT COUNT(*) n FROM payments p WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.lead_id)
`)).recordset[0].n;
const orphanProspectLead = (await pool.request().query(`
  SELECT COUNT(*) n FROM prospects p WHERE p.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.lead_id)
`)).recordset[0].n;
console.log(`  orphan activities: ${orphanLeadAct}  orphan payments: ${orphanLeadPay}  orphan prospect.lead_id: ${orphanProspectLead}`);

console.log('\n=== PACKAGES ===');
const pk = (await pool.request().query(`SELECT COUNT(*) n, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) active FROM packages`)).recordset[0];
console.log('  ', pk);

console.log('\n=== SETTINGS / CRITICAL CONFIG ===');
const set = (await pool.request().query(`SELECT [key], LEFT(value, 80) as val FROM settings`)).recordset;
for (const s of set) console.log(`  ${s.key.padEnd(30)} ${s.val}`);

await pool.close();
