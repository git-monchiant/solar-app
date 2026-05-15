import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const cols = await pool.request().query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('packages')`);
console.log('Columns:', cols.recordset.map(c => c.name).join(', '));
const r = await pool.request().query(`SELECT * FROM packages ORDER BY phase DESC, kwp, has_battery`);
console.log(`\nTotal packages: ${r.recordset.length}\n`);
const byPhase = {};
for (const p of r.recordset) {
  byPhase[p.phase] ??= [];
  byPhase[p.phase].push(p);
}
for (const ph of Object.keys(byPhase).sort()) {
  console.log(`\n=== Phase ${ph} (${byPhase[ph].length} packages) ===`);
  for (const p of byPhase[ph]) {
    const batt = p.has_battery ? '+Battery' : '';
    const pan = p.has_panel ? '+Panel' : '';
    const act = p.is_active ? '✓' : '✗';
    const price = p.price ?? p.sale_price ?? p.amount ?? 0;
    console.log(`  ${act} [${p.id}] ${p.kwp} kWp ${batt}${pan}  ฿${(price||0).toLocaleString()}  — ${p.name}`);
  }
}
await pool.close();
