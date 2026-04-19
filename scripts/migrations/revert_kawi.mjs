// Revert lead 21 (คุณคาวี) back to pre-test state
import sql from "mssql";

const cfg = {
  server: "172.41.1.73", port: 1433, user: "monchiant", password: "monchiant",
  database: "solardb", options: { encrypt: false, trustServerCertificate: true },
};
const LEAD_ID = 21;

const pool = await sql.connect(cfg);

// 1. Delete the test booking we created (SM-26012 for lead 21)
const bk = await pool.request().input("id", sql.Int, LEAD_ID)
  .query(`SELECT id, booking_number FROM bookings WHERE lead_id = @id`);
console.log("Bookings found:", bk.recordset);
for (const b of bk.recordset) {
  await pool.request().input("bid", sql.Int, b.id).query(`DELETE FROM bookings WHERE id = @bid`);
  console.log(`✗ Deleted booking #${b.id} ${b.booking_number}`);
}

// 2. Delete activities created during the test (anything newer than the lead's original created_at + buffer)
// Better: count before/after. For safety, delete activities in last 30 minutes.
const actDel = await pool.request().input("id", sql.Int, LEAD_ID).query(`
  DELETE FROM lead_activities
  WHERE lead_id = @id AND created_at >= DATEADD(minute, -30, GETDATE())
`);
console.log(`✗ Deleted ${actDel.rowsAffected[0]} recent activities`);

// 3. Reset lead fields to pre-test state
await pool.request().input("id", sql.Int, LEAD_ID).query(`
  UPDATE leads SET
    status = 'register',
    pre_monthly_bill = NULL,
    pre_electrical_phase = NULL,
    pre_wants_battery = NULL,
    pre_peak_usage = NULL,
    pre_residence_type = NULL,
    pre_ac_units = NULL,
    survey_date = NULL,
    survey_time_slot = NULL,
    survey_confirmed = 0,
    survey_residence_type = NULL,
    survey_floors = NULL,
    survey_roof_material = NULL,
    survey_roof_orientation = NULL,
    survey_roof_area_m2 = NULL,
    survey_roof_tilt = NULL,
    survey_shading = NULL,
    survey_roof_age = NULL,
    survey_electrical_phase = NULL,
    survey_monthly_bill = NULL,
    survey_peak_usage = NULL,
    survey_grid_type = NULL,
    survey_utility = NULL,
    survey_meter_size = NULL,
    survey_ca_number = NULL,
    survey_db_distance_m = NULL,
    survey_wants_battery = NULL,
    survey_note = NULL,
    updated_at = GETDATE()
  WHERE id = @id
`);
console.log("✓ Lead 21 reverted to register status with pre/survey fields cleared");

// Verify
const r = await pool.request().input("id", sql.Int, LEAD_ID).query(`
  SELECT l.status, l.pre_monthly_bill, l.survey_confirmed, l.survey_note,
         b.booking_number
  FROM leads l LEFT JOIN bookings b ON b.lead_id = l.id
  WHERE l.id = @id
`);
console.log("\nFinal state:", r.recordset[0]);

await pool.close();
