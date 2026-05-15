import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const r = await pool.request().query(`
  SELECT
    COALESCE(NULLIF(p.project_name, N''), pr.name, N'(ไม่ระบุ)') AS name,
    COUNT(*) AS prospects,
    SUM(CASE WHEN p.visited_at IS NOT NULL THEN 1 ELSE 0 END) AS visited,
    SUM(CASE WHEN p.lead_id IS NOT NULL THEN 1 ELSE 0 END) AS converted_to_lead,
    MIN(p.created_at) AS first_seen,
    MAX(p.visited_at) AS last_visit
  FROM prospects p
  LEFT JOIN projects pr ON pr.id = p.project_id
  GROUP BY COALESCE(NULLIF(p.project_name, N''), pr.name, N'(ไม่ระบุ)')
  ORDER BY prospects DESC
`);

console.log(`Total seeker projects: ${r.recordset.length}\n`);
console.log("Name".padEnd(50), "Pros".padStart(6), "Vis".padStart(6), "Lead".padStart(6), "First seen", " Last visit");
console.log("-".repeat(110));
for (const row of r.recordset) {
  const fs = row.first_seen ? new Date(row.first_seen).toISOString().slice(0, 10) : "—";
  const lv = row.last_visit ? new Date(row.last_visit).toISOString().slice(0, 10) : "—";
  console.log(
    String(row.name).slice(0, 50).padEnd(50),
    String(row.prospects).padStart(6),
    String(row.visited).padStart(6),
    String(row.converted_to_lead).padStart(6),
    fs.padStart(10),
    " " + lv.padStart(10),
  );
}
await pool.close();
