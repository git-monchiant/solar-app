import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
await pool.request().query(`DELETE FROM line_users WHERE lead_id IS NULL AND picture_url IS NULL AND id > 1`);
const remain = await pool.request().query(`SELECT id, display_name, lead_id FROM line_users`);
console.log('Remaining:', JSON.stringify(remain.recordset, null, 2));
await pool.close();
