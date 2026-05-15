import sql from 'mssql';

const projectCenters = {
  "เสนา วิลล์ - คลอง 1":                      { lat: 14.049, lng: 100.708 },
  "J City เสนา":                              { lat: 13.748, lng: 100.520 },
  "J Villa เสนา - คลอง 1":                    { lat: 14.052, lng: 100.715 },
  "J Town จังหิล - คลอง 1":                   { lat: 14.055, lng: 100.722 },
  "Exclusive วิลล์":                          { lat: 13.852, lng: 100.556 },
  "เสนา วีราชิณเมศร์ - บางบัวทอง":             { lat: 13.918, lng: 100.428 },
  "เสนา วิลเลจ กม.9":                         { lat: 13.779, lng: 100.683 },
  "เสนา วิว่า รัตนาธิเบศร์ - บางบัวทอง":       { lat: 13.915, lng: 100.435 },
  "เสนา เวล่า รังสิต - คลอง 1":               { lat: 14.045, lng: 100.705 },
  "J City สุขุมวิท - แพรกษา":                 { lat: 13.561, lng: 100.742 },
  "เสนา วิลเลจ สุขุมวิท - แพรกษา":            { lat: 13.558, lng: 100.745 },
  "เสนา อเวนิว 2 รังสิต - คลอง 1":            { lat: 14.041, lng: 100.700 },
  "J Town1 รังสิต - คลอง 1":                  { lat: 14.048, lng: 100.712 },
  "J Town2 รังสิต - คลอง 1":                  { lat: 14.051, lng: 100.718 },
  "J Villa รังสิต - คลอง 1":                  { lat: 14.046, lng: 100.710 },
  "J Exclusive รังสิต - คลอง 1":              { lat: 14.050, lng: 100.716 },
};

function jitter(base, rangeMeters = 200) {
  // 1 deg ≈ 111000 m
  const d = rangeMeters / 111000;
  return base + (Math.random() * 2 - 1) * d;
}

const pool = await sql.connect({
  server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb',
  options:{encrypt:false, trustServerCertificate:true}
});

const r = await pool.request().query(`
  SELECT id, project_name FROM prospects
  WHERE visited_at IS NOT NULL AND (visit_lat IS NULL OR visit_lng IS NULL)
`);
console.log(`Records to update: ${r.recordset.length}`);

let done = 0;
let noCenter = 0;
for (const row of r.recordset) {
  const center = projectCenters[row.project_name];
  if (!center) {
    // Default Bangkok area
    const defaultCenter = { lat: 13.75, lng: 100.55 };
    const lat = jitter(defaultCenter.lat, 15000);
    const lng = jitter(defaultCenter.lng, 15000);
    await pool.request()
      .input('id', sql.Int, row.id)
      .input('lat', sql.Decimal(10, 7), lat)
      .input('lng', sql.Decimal(10, 7), lng)
      .query('UPDATE prospects SET visit_lat=@lat, visit_lng=@lng WHERE id=@id');
    noCenter++;
  } else {
    const lat = jitter(center.lat, 250);
    const lng = jitter(center.lng, 250);
    await pool.request()
      .input('id', sql.Int, row.id)
      .input('lat', sql.Decimal(10, 7), lat)
      .input('lng', sql.Decimal(10, 7), lng)
      .query('UPDATE prospects SET visit_lat=@lat, visit_lng=@lng WHERE id=@id');
  }
  done++;
}
console.log(`Updated: ${done} (no center: ${noCenter})`);
await pool.close();
