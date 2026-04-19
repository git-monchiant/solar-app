import sql from 'mssql';
const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb',
  options: { encrypt: false, trustServerCertificate: true },
});

const lead = await pool.request().query(`SELECT id FROM leads WHERE full_name = N'คุณดิว'`);
if (!lead.recordset.length) { console.log('not found'); process.exit(1); }
const leadId = lead.recordset[0].id;
console.log('lead id:', leadId);

await pool.request().input('lid', sql.Int, leadId).query(`DELETE FROM bookings WHERE lead_id = @lid`);
console.log('bookings deleted');

await pool.request().input('lid', sql.Int, leadId).query(`
  UPDATE leads SET
    status = 'registered',
    interested_package_id = NULL,
    survey_date = NULL,
    monthly_bill = NULL,
    electrical_phase = NULL,
    wants_battery = NULL,
    roof_shape = NULL,
    appliances = NULL,
    ac_units = NULL,
    peak_usage = NULL,
    bill_photo_url = NULL,
    payment_type = NULL,
    updated_at = GETDATE()
  WHERE id = @lid
`);
console.log('lead reset to registered');

await pool.close();
console.log('done');
