// READ-ONLY scan of the leads we plan to revert to step=install.
// Shows current status/stage_code + the install fields computeStageCode reads,
// so we can decide the correct target stage_code. No writes.
//   node scripts/tools/_tmp_revert_install_scan.mjs --db=solardb
import sql from 'mssql';

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith('--db=')) || '--db=solardb_dev';
const database = dbArg.split('=')[1];
const IDS = [552, 560, 400, 408, 421];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB: ${database} (READ-ONLY)\n`);
const r = await pool.request().query(`
  SELECT id, full_name, status,
         install_date, install_completed_at, install_confirmed
  FROM leads WHERE id IN (${IDS.join(',')})
  ORDER BY id
`);
console.table(r.recordset);
await pool.close();
