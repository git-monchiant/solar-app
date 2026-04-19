import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});
await pool.request().query(`UPDATE leads SET next_follow_up = NULL WHERE id = 27`);
console.log('cleared');
await pool.close();
