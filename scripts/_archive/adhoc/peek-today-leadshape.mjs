import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT TOP 3 l.*, p.name as project_name, p.district, p.province
  FROM leads l
  LEFT JOIN projects p ON l.project_id = p.id
  WHERE l.id IN (611, 610, 609)
`);
for (const row of r.recordset) {
  console.log('id:', row.id, '| project_name typeof:', typeof row.project_name, '| value:', JSON.stringify(row.project_name));
}
await pool.close();
