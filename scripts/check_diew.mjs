import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});
const r = await pool.request().query(`
  SELECT id, full_name, status, interested_package_id, survey_date, monthly_bill, electrical_phase, wants_battery, roof_shape, appliances, ac_units, peak_usage, bill_photo_url
  FROM leads WHERE full_name LIKE N'%ดิว%'
`);
console.log(JSON.stringify(r.recordset, null, 2));
const b = await pool.request().query(`
  SELECT b.id, b.booking_number, b.status, b.confirmed, b.lead_id, b.package_id
  FROM bookings b JOIN leads l ON l.id = b.lead_id
  WHERE l.full_name LIKE N'%ดิว%'
`);
console.log('--- bookings ---');
console.log(JSON.stringify(b.recordset, null, 2));
await pool.close();
