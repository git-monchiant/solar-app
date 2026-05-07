import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

// Find vague/generic project names that look like catch-all bins
const r = await pool.request().query(`
  SELECT
    p.id,
    p.name,
    (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id) AS prospects,
    (SELECT COUNT(*) FROM leads l WHERE l.project_id = p.id) AS leads
  FROM projects p
  WHERE p.id <> 109
    AND (p.name LIKE N'%อื่น%' OR p.name LIKE N'%นอก%' OR p.name LIKE N'%ระบุ%')
  ORDER BY p.id
`);
console.log('Vague-named projects (excluding 109):');
console.table(r.recordset);
await pool.close();
