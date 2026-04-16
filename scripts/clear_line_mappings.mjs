import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

// Show current mappings
const before = await pool.request().query(
  `SELECT id, display_name, lead_id FROM line_users WHERE lead_id IS NOT NULL`
);
console.log('Currently mapped line_users:');
console.log(before.recordset);

// Clear all mappings
await pool.request().query(`UPDATE line_users SET lead_id = NULL WHERE lead_id IS NOT NULL`);
await pool.request().query(`UPDATE leads SET line_id = NULL WHERE line_id IS NOT NULL`);

// Verify
const after = await pool.request().query(
  `SELECT id, display_name, lead_id FROM line_users WHERE lead_id IS NOT NULL`
);
const leadsAfter = await pool.request().query(
  `SELECT id, full_name, line_id FROM leads WHERE line_id IS NOT NULL`
);
console.log('Remaining mapped line_users:', after.recordset);
console.log('Remaining leads with line_id:', leadsAfter.recordset);

await pool.close();
