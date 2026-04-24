import sql from 'mssql';
import fs from 'fs';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'SolarDb_UAT', options: { encrypt: false, trustServerCertificate: true }
});

const raw = fs.readFileSync('sql/solardb_clone.sql', 'utf8');
// Split on GO batch terminator (line-only)
const batches = raw.split(/^GO\s*$/m).map(s => s.trim()).filter(Boolean);
console.log(`${batches.length} batches`);

let i = 0, errs = 0;
for (const b of batches) {
  i++;
  try {
    await pool.request().query(b);
    if (i % 20 === 0 || i === batches.length) process.stdout.write(`  ${i}/${batches.length}\r`);
  } catch (e) {
    errs++;
    console.log(`\n  err batch ${i}: ${e.message.slice(0, 200)}`);
    if (errs >= 5) { console.log('  too many errors, stopping'); break; }
  }
}
console.log(`\nDone. batches=${i}, errors=${errs}`);

// Verify
const tables = await pool.request().query(`SELECT name, (SELECT SUM(row_count) FROM sys.dm_db_partition_stats WHERE object_id = t.object_id AND index_id IN (0,1)) AS rows FROM sys.tables t WHERE is_ms_shipped = 0 ORDER BY name`);
console.log('\nTables in SolarDb_UAT:');
for (const t of tables.recordset) console.log(`  ${t.name}: ${t.rows ?? '?'} rows`);
await pool.close();
