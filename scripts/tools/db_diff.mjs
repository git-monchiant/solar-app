// Verify which DB is more recent: list all DBs on server, then per-table
// column counts and which side has extras.

import sql from 'mssql';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'master',
  options: { encrypt: false, trustServerCertificate: true },
});

console.log('=== All databases on server ===');
const dbs = (await pool.request().query(`SELECT name, create_date FROM sys.databases WHERE database_id > 4 ORDER BY name`)).recordset;
dbs.forEach(d => console.log(`  ${d.name.padEnd(30)} created ${d.create_date.toISOString().slice(0,10)}`));

console.log('\n=== solardb vs solardb_dev: per-table column comparison ===');
const A = 'solardb', B = 'solardb_dev';

const cols = (db) => pool.request().query(`
  SELECT t.name AS tbl, c.name AS col
  FROM [${db}].sys.columns c
  JOIN [${db}].sys.tables t ON c.object_id = t.object_id
  WHERE t.is_ms_shipped = 0
  ORDER BY t.name, c.column_id
`).then(r => {
  const map = new Map();
  for (const row of r.recordset) {
    if (!map.has(row.tbl)) map.set(row.tbl, new Set());
    map.get(row.tbl).add(row.col);
  }
  return map;
});

const a = await cols(A);
const b = await cols(B);
const allTables = new Set([...a.keys(), ...b.keys()]);

console.log(`${'table'.padEnd(28)} ${A} cols  ${B} cols  only-in-${A}  only-in-${B}`);
for (const t of [...allTables].sort()) {
  const ac = a.get(t) ?? new Set();
  const bc = b.get(t) ?? new Set();
  const onlyA = [...ac].filter(c => !bc.has(c));
  const onlyB = [...bc].filter(c => !ac.has(c));
  const aMark = !a.has(t) ? '(none)' : String(ac.size);
  const bMark = !b.has(t) ? '(none)' : String(bc.size);
  console.log(`${t.padEnd(28)} ${aMark.padStart(9)}     ${bMark.padStart(7)}     ${String(onlyA.length).padStart(8)}    ${String(onlyB.length).padStart(8)}`);
  if (onlyA.length) console.log(`    only in ${A}: ${onlyA.join(', ')}`);
  if (onlyB.length) console.log(`    only in ${B}: ${onlyB.join(', ')}`);
}

await pool.close();
