// Backfill lead_inverters / lead_batteries / lead_panels from the legacy
// JSON/text fields living on the leads row.
//
// Sources:
//   leads.warranty_inverter_sn / brand / kw / sn_photo / cert_url  → 1 row
//   leads.warranty_batteries (JSON [{brand, kwh, serial}, ...])    → N rows
//   leads.warranty_panel_serials (JSON ["sn1","sn2",...]) + brand  → N rows
//
// Idempotent: only inserts when the lead has NO existing rows in the target
// table — re-running is safe and skips already-migrated leads.

import sql from 'mssql';

const dbArg = process.argv.find(a => a.startsWith('--db='));
if (!dbArg) { console.error('Usage: node 033_backfill_lead_devices.mjs --db=<db>'); process.exit(1); }
const database = dbArg.split('=')[1];

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database, options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Backfilling lead devices on ${database} ...`);

// Pull all leads that have ANY legacy warranty data.
const { recordset: leads } = await pool.request().query(`
  SELECT id,
         warranty_inverter_brand, warranty_inverter_kw, warranty_inverter_sn,
         warranty_inverter_sn_photo_url, warranty_inverter_cert_url,
         warranty_batteries, warranty_battery_brand, warranty_battery_kwh,
         warranty_panel_brand, warranty_panel_count, warranty_panel_serials
  FROM leads
  WHERE warranty_inverter_sn IS NOT NULL
     OR warranty_inverter_brand IS NOT NULL
     OR warranty_inverter_kw IS NOT NULL
     OR warranty_batteries IS NOT NULL
     OR warranty_battery_brand IS NOT NULL
     OR warranty_panel_serials IS NOT NULL
     OR warranty_panel_brand IS NOT NULL
`);
console.log(`  ${leads.length} leads with legacy warranty data`);

let invIns = 0, battIns = 0, panelIns = 0, skipped = 0;

for (const l of leads) {
  // Skip leads that already have device rows — keep backfill idempotent.
  const existing = await pool.request().input('id', sql.Int, l.id).query(`
    SELECT
      (SELECT COUNT(*) FROM lead_inverters WHERE lead_id = @id) AS inv,
      (SELECT COUNT(*) FROM lead_batteries WHERE lead_id = @id) AS batt,
      (SELECT COUNT(*) FROM lead_panels    WHERE lead_id = @id) AS pan
  `);
  const e = existing.recordset[0];
  if (e.inv > 0 || e.batt > 0 || e.pan > 0) { skipped++; continue; }

  // --- inverter (always at most 1) ---
  if (l.warranty_inverter_brand || l.warranty_inverter_kw != null || l.warranty_inverter_sn) {
    await pool.request()
      .input('lead_id', sql.Int, l.id)
      .input('brand', sql.NVarChar(100), l.warranty_inverter_brand)
      .input('kw', sql.Decimal(10, 3), l.warranty_inverter_kw)
      .input('serial_no', sql.NVarChar(100), l.warranty_inverter_sn)
      .input('photo_url', sql.NVarChar(500), l.warranty_inverter_sn_photo_url)
      .input('cert_url', sql.NVarChar(500), l.warranty_inverter_cert_url)
      .query(`
        INSERT INTO lead_inverters (lead_id, brand, kw, serial_no, photo_url, cert_url, position)
        VALUES (@lead_id, @brand, @kw, @serial_no, @photo_url, @cert_url, 0)
      `);
    invIns++;
  }

  // --- batteries (JSON array or legacy single fields) ---
  let battList = [];
  if (l.warranty_batteries) {
    try {
      const parsed = JSON.parse(l.warranty_batteries);
      if (Array.isArray(parsed)) battList = parsed;
    } catch { /* malformed JSON — fall through */ }
  }
  // Legacy single battery — only fall back when no JSON array
  if (battList.length === 0 && (l.warranty_battery_brand || l.warranty_battery_kwh != null)) {
    battList = [{ brand: l.warranty_battery_brand, kwh: l.warranty_battery_kwh, serial: null }];
  }
  for (let i = 0; i < battList.length; i++) {
    const b = battList[i] || {};
    // Skip totally empty rows (UI sometimes pads empties)
    if (!b.brand && b.kwh == null && !b.serial) continue;
    await pool.request()
      .input('lead_id', sql.Int, l.id)
      .input('brand', sql.NVarChar(100), b.brand ?? null)
      .input('kwh', sql.Decimal(10, 3), b.kwh != null && b.kwh !== '' ? Number(b.kwh) : null)
      .input('serial_no', sql.NVarChar(100), b.serial ?? null)
      .input('position', sql.Int, i)
      .query(`
        INSERT INTO lead_batteries (lead_id, brand, kwh, serial_no, position)
        VALUES (@lead_id, @brand, @kwh, @serial_no, @position)
      `);
    battIns++;
  }

  // --- panels (JSON array of serials + one shared brand) ---
  let panelSerials = [];
  if (l.warranty_panel_serials) {
    try {
      const parsed = JSON.parse(l.warranty_panel_serials);
      if (Array.isArray(parsed)) panelSerials = parsed;
    } catch { /* ignore */ }
  }
  // If we have a brand and a count but no serial array, seed empty rows so
  // the panel count is preserved (useful when the seller logged the count
  // but didn't transcribe each SN yet).
  if (panelSerials.length === 0 && l.warranty_panel_count > 0) {
    panelSerials = Array.from({ length: l.warranty_panel_count }, () => null);
  }
  for (let i = 0; i < panelSerials.length; i++) {
    const sn = panelSerials[i];
    const trimmed = typeof sn === 'string' ? sn.trim() : sn;
    // Only insert when there's a serial OR a brand to track (skip blanks)
    if (!trimmed && !l.warranty_panel_brand) continue;
    await pool.request()
      .input('lead_id', sql.Int, l.id)
      .input('brand', sql.NVarChar(100), l.warranty_panel_brand ?? null)
      .input('serial_no', sql.NVarChar(100), trimmed || null)
      .input('position', sql.Int, i)
      .query(`
        INSERT INTO lead_panels (lead_id, brand, serial_no, position)
        VALUES (@lead_id, @brand, @serial_no, @position)
      `);
    panelIns++;
  }
}

console.log(`Done. inverters=${invIns} batteries=${battIns} panels=${panelIns} skipped=${skipped}`);
await pool.close();
