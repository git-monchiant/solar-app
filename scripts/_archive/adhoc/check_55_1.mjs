import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`
  SELECT id, project_id, house_number, full_name, interest, interest_type, visited_at, visit_count, note, contact_time, updated_at, created_at
  FROM prospects WHERE project_id = 24 AND house_number = '55/1'
`);
console.log(JSON.stringify(r.recordset, null, 2));
await pool.close();
