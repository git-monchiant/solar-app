import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const r = await pool.request().query(`SELECT id, full_name, status, survey_confirmed, survey_lat, survey_lng FROM leads WHERE id = 11`);
console.log('Before:', r.recordset);
await pool.request().query(`
  UPDATE leads SET
    survey_confirmed = 0,
    survey_lat = NULL,
    survey_lng = NULL,
    survey_note = NULL,
    survey_photos = NULL,
    survey_electrical_phase = NULL,
    survey_wants_battery = NULL,
    survey_panel_count = NULL,
    survey_monthly_bill = NULL,
    survey_appliances = NULL,
    survey_roof_material = NULL,
    survey_roof_orientation = NULL,
    survey_floors = NULL,
    survey_roof_area_m2 = NULL,
    survey_meter_size = NULL,
    survey_db_distance_m = NULL,
    survey_shading = NULL,
    survey_roof_tilt = NULL,
    survey_voltage_ln = NULL,
    survey_voltage_ll = NULL,
    survey_mdb_brand = NULL,
    survey_mdb_model = NULL,
    survey_mdb_slots = NULL,
    survey_breaker_type = NULL,
    survey_panel_to_inverter_m = NULL,
    survey_roof_structure = NULL,
    survey_roof_width_m = NULL,
    survey_roof_length_m = NULL,
    survey_inverter_location = NULL,
    survey_wifi_signal = NULL,
    survey_access_method = NULL,
    survey_photo_building_url = NULL,
    survey_photo_roof_structure_url = NULL,
    survey_photo_mdb_url = NULL,
    survey_photo_inverter_point_url = NULL,
    survey_recommended_kw = NULL,
    survey_customer_signature_url = NULL,
    status = CASE WHEN status IN ('survey','quote','order','install','warranty','gridtie','closed') THEN 'survey' ELSE status END
  WHERE id = 11
`);
const r2 = await pool.request().query(`SELECT id, status, survey_confirmed, survey_lat, survey_lng FROM leads WHERE id = 11`);
console.log('After:', r2.recordset);
await pool.close();
