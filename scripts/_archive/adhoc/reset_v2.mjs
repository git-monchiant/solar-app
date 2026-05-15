import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });

const l = await pool.request().query(`
  UPDATE leads SET
    status = 'pre_survey',
    payment_confirmed = 0, survey_confirmed = 0, install_confirmed = 0, review_sent = 0,
    order_before_paid = 0, order_after_paid = 0,
    -- pre
    pre_package_id = NULL, pre_slip_url = NULL, pre_doc_no = NULL, pre_total_price = NULL, pre_booked_at = NULL,
    pre_monthly_bill = NULL, pre_electrical_phase = NULL, pre_wants_battery = NULL, pre_roof_shape = NULL,
    pre_appliances = NULL, pre_ac_units = NULL, pre_peak_usage = NULL, pre_primary_reason = NULL,
    pre_bill_photo_url = NULL, pre_residence_type = NULL, pre_note = NULL,
    pre_pay_amount = NULL, pre_pay_description = NULL, pre_pay_installment = NULL, pre_pay_token = NULL,
    -- survey
    survey_date = NULL, survey_time_slot = NULL, survey_note = NULL, survey_photos = NULL,
    survey_electrical_phase = NULL, survey_wants_battery = NULL, survey_panel_count = NULL,
    survey_monthly_bill = NULL, survey_appliances = NULL, survey_roof_material = NULL,
    survey_roof_orientation = NULL, survey_floors = NULL, survey_roof_area_m2 = NULL,
    survey_meter_size = NULL, survey_db_distance_m = NULL, survey_shading = NULL, survey_roof_tilt = NULL,
    survey_voltage_ln = NULL, survey_voltage_ll = NULL, survey_mdb_brand = NULL, survey_mdb_model = NULL,
    survey_mdb_slots = NULL, survey_breaker_type = NULL, survey_panel_to_inverter_m = NULL,
    survey_roof_structure = NULL, survey_roof_width_m = NULL, survey_roof_length_m = NULL,
    survey_inverter_location = NULL, survey_wifi_signal = NULL, survey_access_method = NULL,
    survey_photo_building_url = NULL, survey_photo_roof_structure_url = NULL,
    survey_photo_mdb_url = NULL, survey_photo_inverter_point_url = NULL,
    survey_recommended_kw = NULL, survey_customer_signature_url = NULL,
    survey_lat = NULL, survey_lng = NULL,
    -- quotation
    quotation_note = NULL, quotation_files = NULL, quotation_amount = NULL,
    -- order
    order_total = NULL, order_pct_before = NULL, order_pct_after = NULL,
    order_before_slip = NULL, order_after_slip = NULL,
    -- install
    install_date = NULL, install_time_slot = NULL, install_photos = NULL,
    install_note = NULL, install_extra_note = NULL, install_extra_cost = NULL,
    install_customer_signature_url = NULL, install_completed_at = NULL,
    -- review
    review_rating = NULL, review_quality = NULL, review_service = NULL,
    review_punctuality = NULL, review_comment = NULL,
    -- warranty
    warranty_inverter_sn = NULL, warranty_doc_no = NULL, warranty_start_date = NULL,
    warranty_end_date = NULL, warranty_issued_at = NULL, warranty_doc_url = NULL,
    warranty_customer_signature_url = NULL, warranty_inverter_cert_url = NULL,
    warranty_panel_cert_url = NULL, warranty_panel_serials_url = NULL,
    warranty_other_docs_url = NULL, warranty_system_size_kwp = NULL,
    warranty_panel_count = NULL, warranty_panel_watt = NULL, warranty_panel_brand = NULL,
    warranty_inverter_brand = NULL, warranty_inverter_kw = NULL, warranty_battery_brand = NULL,
    warranty_battery_kwh = NULL, warranty_has_battery = NULL,
    warranty_inverter_sn_photo_url = NULL, warranty_batteries = NULL,
    -- grid
    grid_utility = NULL, grid_app_no = NULL, grid_erc_submitted_date = NULL,
    grid_submitted_date = NULL, grid_inspection_date = NULL, grid_approved_date = NULL,
    grid_meter_changed_date = NULL, grid_permit_doc_url = NULL, grid_note = NULL,
    -- misc
    lost_reason = NULL, revisit_date = NULL, next_follow_up = NULL,
    interested_package_id = NULL, interested_package_ids = NULL,
    id_card_number = NULL, id_card_address = NULL,
    id_card_photo_url = NULL, house_reg_photo_url = NULL, meter_number = NULL,
    last_contact_result = NULL, home_equity_check = NULL, finance_status = NULL,
    payment_type = NULL, requirement = NULL
`);
console.log('leads reset:', l.rowsAffected[0]);

const p = await pool.request().query(`
  UPDATE prospects SET interest = NULL, visited_at = NULL, returned_at = NULL, lead_id = NULL
`);
console.log('prospects reset:', p.rowsAffected[0]);

const check = await pool.request().query(`
  SELECT status, COUNT(*) AS n FROM leads GROUP BY status ORDER BY n DESC
`);
console.log('lead statuses after:', check.recordset);
await pool.close();
