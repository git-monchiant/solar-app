import sql from 'mssql';
const config = {
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'solardb', options: { encrypt: false, trustServerCertificate: true },
};
// Force every lead's line_id to the developer's own LINE userId so LINE push test
// messages never reach real customers during dev.
const MY_LINE_ID = 'U734f01324656c9af174f0aef15d95b84';
const pool = await sql.connect(config);
const res = await pool.request()
  .input('lid', sql.NVarChar(100), MY_LINE_ID)
  .query(`UPDATE leads SET line_id = @lid`);
console.log(`Set line_id = ${MY_LINE_ID} on ${res.rowsAffected[0]} leads.`);
await pool.close();
