#!/usr/bin/env node
// Wipe all lead progress + related rows so every lead looks freshly created.
// Also empties public/uploads on Mac and ~/solar-app/uploads on UAT.
//
// Usage:
//   node scripts/adhoc/reset_test_data.mjs            # confirms first
//   node scripts/adhoc/reset_test_data.mjs --force    # skip confirm
//   node scripts/adhoc/reset_test_data.mjs --no-uat   # skip UAT uploads cleanup
//
// Affects ONE shared DB (172.41.1.73/solardb) — both dev + UAT read from it.

import sql from "mssql";
import { readFileSync, readdirSync, unlinkSync, statSync } from "fs";
import { createInterface } from "readline";
import { execFileSync } from "child_process";
import path from "path";

const FORCE = process.argv.includes("--force");
const SKIP_UAT = process.argv.includes("--no-uat");

const DB = {
  server: "172.41.1.73", port: 1433,
  user: "monchiant", password: "monchiant", database: "solardb",
  options: { encrypt: false, trustServerCertificate: true },
};

const UAT_HOST = "172.22.22.100";
const UAT_PORT = "1822";
const UAT_USER = "optimus-dev";
const UAT_PASS = "0pt!musd3V";
const UAT_UPLOADS = "~/solar-app/uploads";

function ask(q) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

async function confirmReset() {
  if (FORCE) return true;
  const a = await ask("\n⚠️  This wipes ALL leads' progress + payments + slips + uploads.\n   Type 'reset' to continue: ");
  return a.trim() === "reset";
}

async function resetDb() {
  const pool = await sql.connect(DB);
  const before = await pool.request().query("SELECT COUNT(*) n FROM leads");
  console.log(`leads in db: ${before.recordset[0].n}`);

  // Nullify every column EXCEPT what /api/leads POST sets. Status → pre_survey.
  const r = await pool.request().query(`
    UPDATE leads SET
      status = 'pre_survey', updated_at = GETDATE(),
      line_id = NULL,
      assigned_staff = NULL, assigned_user_id = NULL,
      finance_status = NULL, home_equity_check = NULL,
      meter_number = NULL, last_contact_result = NULL,
      next_follow_up = NULL, revisit_date = NULL, lost_reason = NULL,
      zone = NULL,
      payment_confirmed = 0, survey_confirmed = 0, install_confirmed = 0,
      order_before_paid = 0, order_after_paid = 0, review_sent = 0,
      warranty_has_battery = 0,
      install_completed_at = NULL, install_customer_signature_url = NULL,
      install_date = NULL, install_extra_cost = NULL, install_extra_note = NULL,
      install_note = NULL, install_photos = NULL, install_time_slot = NULL,
      order_after_slip = NULL, order_before_slip = NULL,
      order_pct_after = NULL, order_pct_before = NULL, order_total = NULL,
      pre_ac_units = NULL, pre_appliances = NULL, pre_bill_photo_url = NULL,
      pre_booked_at = NULL, pre_doc_no = NULL, pre_electrical_phase = NULL,
      pre_monthly_bill = NULL, pre_note = NULL, pre_package_id = NULL,
      pre_pay_amount = NULL, pre_pay_description = NULL, pre_pay_installment = NULL,
      pre_pay_token = NULL, pre_peak_usage = NULL, pre_primary_reason = NULL,
      pre_residence_type = NULL, pre_roof_shape = NULL, pre_slip_url = NULL,
      pre_total_price = NULL, pre_wants_battery = NULL,
      quotation_amount = NULL, quotation_files = NULL, quotation_note = NULL,
      review_comment = NULL, review_punctuality = NULL, review_quality = NULL,
      review_rating = NULL, review_service = NULL,
      survey_ac_units = NULL, survey_appliances = NULL, survey_battery_kwh = NULL,
      survey_ca_number = NULL, survey_date = NULL, survey_db_distance_m = NULL,
      survey_electrical_phase = NULL, survey_floors = NULL, survey_grid_type = NULL,
      survey_inverter = NULL, survey_meter_size = NULL, survey_monthly_bill = NULL,
      survey_note = NULL, survey_panel_count = NULL, survey_panel_id = NULL,
      survey_peak_usage = NULL, survey_photos = NULL, survey_residence_type = NULL,
      survey_roof_age = NULL, survey_roof_area_m2 = NULL, survey_roof_material = NULL,
      survey_roof_orientation = NULL, survey_roof_tilt = NULL, survey_shading = NULL,
      survey_time_slot = NULL, survey_utility = NULL, survey_wants_battery = NULL,
      warranty_batteries = NULL, warranty_battery_brand = NULL, warranty_battery_kwh = NULL,
      warranty_customer_signature_url = NULL, warranty_doc_no = NULL, warranty_doc_url = NULL,
      warranty_end_date = NULL, warranty_inverter_brand = NULL, warranty_inverter_cert_url = NULL,
      warranty_inverter_kw = NULL, warranty_inverter_sn = NULL, warranty_inverter_sn_photo_url = NULL,
      warranty_issued_at = NULL, warranty_other_docs_url = NULL,
      warranty_panel_brand = NULL, warranty_panel_cert_url = NULL, warranty_panel_count = NULL,
      warranty_panel_serials_url = NULL, warranty_panel_watt = NULL,
      warranty_start_date = NULL, warranty_system_size_kwp = NULL,
      grid_app_no = NULL, grid_approved_date = NULL, grid_erc_submitted_date = NULL,
      grid_inspection_date = NULL, grid_meter_changed_date = NULL, grid_note = NULL,
      grid_permit_doc_url = NULL, grid_submitted_date = NULL, grid_utility = NULL,
      interested_package_ids = NULL
  `);
  console.log(`  leads nullified: ${r.rowsAffected[0]}`);

  for (const [tbl, label] of [
    ["payments", "payments"],
    ["slip_files", "slip_files (staging)"],
    ["lead_activities", "lead_activities"],
    ["payment_logs", "payment_logs"],
  ]) {
    const d = await pool.request().query(`DELETE FROM ${tbl}`);
    console.log(`  ${label} deleted: ${d.rowsAffected[0]}`);
  }

  // Re-map lookups live on line_users, so clear its lead_id ref too.
  const lu = await pool.request().query(`UPDATE line_users SET lead_id = NULL WHERE lead_id IS NOT NULL`);
  console.log(`  line_users unmapped: ${lu.rowsAffected[0]}`);

  await pool.close();
}

function cleanLocalUploads() {
  const dir = path.resolve("public/uploads");
  let count = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (f === ".gitkeep") continue;
      const p = path.join(dir, f);
      if (statSync(p).isFile()) { unlinkSync(p); count++; }
    }
    console.log(`  local uploads deleted: ${count}`);
  } catch (e) {
    console.log(`  local uploads: skipped (${e.message})`);
  }
}

function cleanUatUploads() {
  if (SKIP_UAT) { console.log("  uat uploads: skipped (--no-uat)"); return; }
  try {
    execFileSync("sshpass", [
      "-p", UAT_PASS,
      "ssh",
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-p", UAT_PORT,
      `${UAT_USER}@${UAT_HOST}`,
      `find ${UAT_UPLOADS} -type f -not -name '.gitkeep' -delete && echo 'ok'`,
    ], { stdio: "inherit" });
  } catch (e) {
    console.log(`  uat uploads: failed (${e.message})`);
  }
}

const ok = await confirmReset();
if (!ok) { console.log("cancelled."); process.exit(0); }

console.log("\n🧹 DB:");
await resetDb();
console.log("\n🧹 uploads:");
cleanLocalUploads();
cleanUatUploads();
console.log("\n✅ done.");
