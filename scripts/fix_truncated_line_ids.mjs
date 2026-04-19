import sql from 'mssql';
const config = {
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'solardb', options: { encrypt: false, trustServerCertificate: true },
};
const pool = await sql.connect(config);
// Replace truncated lead.line_id with the full line_users.line_user_id whose prefix matches.
const res = await pool.request().query(`
  UPDATE l SET line_id = lu.line_user_id
  OUTPUT INSERTED.id, INSERTED.line_id
  FROM leads l
  JOIN line_users lu ON lu.line_user_id LIKE l.line_id + '%' AND LEN(lu.line_user_id) > LEN(l.line_id)
  WHERE l.line_id IS NOT NULL
`);
console.log(`Updated ${res.rowsAffected[0]} leads.`);
console.log(res.recordset);
await pool.close();
