// Find which text field on lead 562 contains the survey/install description.
import sql from 'mssql';
const dbArg = process.argv.slice(2).find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});
console.log(`Target DB: ${database}\n`);

const row = await pool.request().input('id', sql.Int, 562).query(`SELECT * FROM leads WHERE id = @id`);
const r = row.recordset[0];
console.log(`Lead 562 · ${r.full_name}`);
console.log('--- non-empty text-ish fields ---');
for (const [k, v] of Object.entries(r)) {
  if (typeof v === 'string' && v.trim().length > 0) {
    const short = v.length > 100 ? v.slice(0, 100) + '…' : v;
    console.log(`  ${k}: ${JSON.stringify(short)}`);
  }
}
await pool.close();
