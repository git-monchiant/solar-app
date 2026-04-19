// Backfill district + province for projects using OpenStreetMap Nominatim (free, no key)
// Rate limit: 1 req/sec per their usage policy.
import sql from 'mssql';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&accept-language=th&countrycodes=th&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'sena-solar-app/1.0 (internal use)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  const addr = data[0].address || {};
  // Thai admin names: county (อำเภอ), state (จังหวัด)
  const district = addr.county || addr.city_district || addr.district || addr.suburb || null;
  const province = addr.state || addr.province || null;
  return { district, province, raw: addr };
}

const { recordset: projects } = await pool.request().query(
  `SELECT id, name FROM projects WHERE district IS NULL OR province IS NULL`
);
console.log(`Geocoding ${projects.length} projects...`);

for (const p of projects) {
  // Try project name + Thailand
  const q = `${p.name} ประเทศไทย`;
  const result = await geocode(q);
  if (result && (result.district || result.province)) {
    console.log(`✓ ${p.id} ${p.name} → ${result.district || '-'}, ${result.province || '-'}`);
    await pool.request()
      .input('id', sql.Int, p.id)
      .input('district', sql.NVarChar(100), result.district)
      .input('province', sql.NVarChar(100), result.province)
      .query('UPDATE projects SET district = @district, province = @province WHERE id = @id');
  } else {
    console.log(`✗ ${p.id} ${p.name} — not found`);
  }
  await sleep(1100); // respect Nominatim rate limit
}

await pool.close();
console.log('done');
