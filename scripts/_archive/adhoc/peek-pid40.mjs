import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const r = await pool.request().query(`
  SELECT p.id, p.house_number, p.interest, p.interest_type, p.lead_id, p.returned_at, p.visited_at,
         CASE WHEN p.note IS NOT NULL AND LEN(LTRIM(RTRIM(p.note))) > 0 THEN 1 ELSE 0 END AS has_note
  FROM prospects p
  WHERE p.project_id = 40 AND p.lead_id IS NOT NULL
  ORDER BY p.id
`);
console.log(`Project 40: ${r.recordset.length} prospects with lead_id`);
console.log("ID   | House    | Interest        | Type    | LeadID | Returned | Visited");
console.log("-".repeat(100));
for (const p of r.recordset) {
  console.log(
    String(p.id).padEnd(4),
    "|", String(p.house_number||'-').padEnd(8),
    "|", String(p.interest||'(null)').padEnd(15),
    "|", String(p.interest_type||'-').padEnd(7),
    "|", String(p.lead_id).padEnd(6),
    "|", p.returned_at ? '✗ ret' : '   ',
    "|", p.visited_at ? 'Y' : 'N'
  );
}
console.log();
const summary = await pool.request().query(`
  SELECT
    COUNT(*) AS total_with_lead,
    SUM(CASE WHEN interest = 'interested' THEN 1 ELSE 0 END) AS interest_eq_interested,
    SUM(CASE WHEN returned_at IS NOT NULL THEN 1 ELSE 0 END) AS returned
  FROM prospects WHERE project_id = 40 AND lead_id IS NOT NULL
`);
console.log('Summary:', summary.recordset[0]);
await pool.close();
