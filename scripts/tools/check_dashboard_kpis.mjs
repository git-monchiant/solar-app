// Verify every dashboard KPI against the same lifecycle-row data the page uses.
// Re-runs the dashboard's filter logic on raw rows and surfaces:
//   1. Each KPI's numeric value
//   2. Invariant checks (sums add up, no overlaps, no leaks)
//   3. Sample IDs for any anomalies
//
// Run: node scripts/tools/check_dashboard_kpis.mjs
import sql from "mssql";

const pool = await sql.connect({
  server: "172.41.1.73", port: 1433,
  user: "monchiant", password: "monchiant",
  database: "solardb_dev",
  options: { encrypt: false, trustServerCertificate: true },
});

// Mirror /api/lifecycle SQL so we get the exact same row shape the dashboard sees.
const contactStateExpr = (alias) => `
  CASE
    WHEN ${alias}.title LIKE N'ติดต่อไม่ได้%' THEN 'no'
    WHEN ${alias}.title LIKE N'ติดต่อได้%' THEN 'yes'
    WHEN ${alias}.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
    ELSE NULL
  END`;

const result = await pool.request().query(`
  ;WITH raw_contacts AS (
    SELECT lead_id, created_at, activity_type, title,
      ROW_NUMBER() OVER (PARTITION BY lead_id, CAST(created_at AS DATE) ORDER BY created_at ASC) AS day_rn
    FROM lead_activities
    WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
  ),
  contacts AS (
    SELECT lead_id, created_at, activity_type, title,
      ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at ASC) AS rn
    FROM raw_contacts WHERE day_rn = 1
  )
  SELECT
    l.id, l.status, l.survey_date, l.install_date,
    l.install_completed_at AS install_done_at,
    l.order_installments,
    (SELECT COUNT(*) FROM payments
      WHERE lead_id = l.id AND slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL) AS order_paid_count,
    CASE WHEN EXISTS (SELECT 1 FROM slip_files WHERE lead_id = l.id AND slip_field = 'pre_slip_url')
              OR EXISTS (SELECT 1 FROM payments WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL)
         THEN 1 ELSE 0 END AS pre_slip_uploaded,
    COALESCE(c1.created_at,
      CASE WHEN EXISTS (SELECT 1 FROM payments WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL)
           THEN l.created_at END) AS first_contact_at,
    CASE
      WHEN c1.title LIKE N'ติดต่อไม่ได้%' THEN 'no'
      WHEN c1.title LIKE N'ติดต่อได้%' THEN 'yes'
      WHEN c1.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
      WHEN c1.activity_type IS NULL AND EXISTS (
        SELECT 1 FROM payments WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL
      ) THEN 'yes'
      ELSE NULL
    END AS first_contact_state,
    ${contactStateExpr("c2")} AS contact2_state,
    ${contactStateExpr("c3")} AS contact3_state,
    ${contactStateExpr("c4")} AS contact4_state,
    ${contactStateExpr("c5")} AS contact5_state,
    COALESCE(
      (SELECT MIN(created_at) FROM lead_activities WHERE lead_id = l.id AND title LIKE N'%เสนอขาย%'),
      (SELECT MIN(submitted_at) FROM payments WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL)
    ) AS sales_pitch_at,
    (SELECT MIN(confirmed_at) FROM payments WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL) AS booking_paid_at,
    (SELECT MIN(confirmed_at) FROM payments WHERE lead_id = l.id AND slip_field LIKE 'order[_]%' AND confirmed_at IS NOT NULL) AS order_paid_at
  FROM leads l
  LEFT JOIN contacts c1 ON c1.lead_id = l.id AND c1.rn = 1
  LEFT JOIN contacts c2 ON c2.lead_id = l.id AND c2.rn = 2
  LEFT JOIN contacts c3 ON c3.lead_id = l.id AND c3.rn = 3
  LEFT JOIN contacts c4 ON c4.lead_id = l.id AND c4.rn = 4
  LEFT JOIN contacts c5 ON c5.lead_id = l.id AND c5.rn = 5
`);

const rows = result.recordset;
const today = new Date(new Date().toDateString());

// Helpers — match dashboard logic 1:1
const states = (r) => [r.first_contact_state, r.contact2_state, r.contact3_state, r.contact4_state, r.contact5_state];
const totalLeads = rows.length;

const bookingPaidRows = rows.filter((r) => r.booking_paid_at);
const bookingPaidCount = bookingPaidRows.length;

const contactedYesRows = rows.filter((r) => !!r.booking_paid_at || states(r).some((s) => s === "yes"));
const contactedYes = contactedYesRows.length;
const contactedNo = rows.filter((r) => {
  if (r.booking_paid_at) return false;
  const ss = states(r);
  return ss.some((s) => s === "no") && !ss.some((s) => s === "yes");
}).length;
const notContacted = totalLeads - contactedYes - contactedNo;

const contactedNoPitch = contactedYesRows.filter((r) => r.status === "pre_survey" && !r.sales_pitch_at && r.pre_slip_uploaded !== 1).length;
const contactedInPitch = contactedYesRows.filter((r) => r.status === "pre_survey" && r.sales_pitch_at && r.pre_slip_uploaded !== 1).length;
const contactedSlipPending = contactedYesRows.filter((r) => r.status === "pre_survey-01" || (r.status === "pre_survey" && r.pre_slip_uploaded === 1)).length;
const contactedBooked = contactedYesRows.filter((r) => !!r.booking_paid_at).length;
const contactedLost = contactedYesRows.filter((r) => r.status === "lost").length;

// Count status breakdown
const countsByStatus = {};
for (const r of rows) countsByStatus[r.status] = (countsByStatus[r.status] || 0) + 1;

const orderRows = bookingPaidRows.filter((r) => r.status === "order");
const orderPaidFull = orderRows.filter((r) => {
  if (!r.order_paid_at) return false;
  let total = 0;
  try { total = r.order_installments ? JSON.parse(r.order_installments).length : 0; } catch {}
  return r.order_paid_count > 0 && r.order_paid_count >= total;
}).length;
const orderPaidPartial = orderRows.filter((r) => r.order_paid_at).length - orderPaidFull;
const orderUnpaid = orderRows.length - orderPaidPartial - orderPaidFull;

const stepWaitSurvey = countsByStatus["pre_survey-02"] || 0;
const stepSurveyScheduled = bookingPaidRows.filter((r) => r.status === "survey" && r.survey_date && new Date(r.survey_date) > today).length;
const stepSurveying = bookingPaidRows.filter((r) => r.status === "survey" && (!r.survey_date || new Date(r.survey_date) <= today)).length;
const stepWaitQuote = bookingPaidRows.filter((r) => r.status === "quote").length;
const stepInstallScheduled = bookingPaidRows.filter((r) => r.status === "install" && r.install_date && !r.install_done_at && new Date(r.install_date) > today).length;
const stepInstalling = bookingPaidRows.filter((r) => r.status === "install" && (!r.install_date || new Date(r.install_date) <= today) && !r.install_done_at).length;
const stepDone = bookingPaidRows.filter((r) => ["warranty", "gridtie", "closed"].includes(r.status)).length;
const stepLostAfter = bookingPaidRows.filter((r) => r.status === "lost").length;

const sample = (arr, n = 5) => arr.slice(0, n).map((r) => r.id).join(", ");

const log = (label, val, extra = "") => console.log(`  ${label.padEnd(34)} ${String(val).padStart(5)}  ${extra}`);
const ok = (cond) => cond ? "✓" : "✗ MISMATCH";

console.log("\n========== ROW 1 — Hero KPIs ==========\n");
console.log("LEADS ทั้งหมด");
log("Total", totalLeads);
log("  ยังไม่ติดต่อ", notContacted);
log("  ติดต่อได้", contactedYes);
log("  ติดต่อไม่ได้", contactedNo);
log("  SUM", notContacted + contactedYes + contactedNo, ok(notContacted + contactedYes + contactedNo === totalLeads));

console.log("\nติดต่อได้ — ปลายทาง (sum should equal ติดต่อได้)");
log("Total ติดต่อได้", contactedYes);
log("  ยังไม่สะดวกคุย", contactedNoPitch);
log("  ระหว่างเสนอ", contactedInPitch);
log("  รอ confirm", contactedSlipPending);
log("  จองแล้ว", contactedBooked);
log("  ยกเลิก", contactedLost);
const bucketSum = contactedNoPitch + contactedInPitch + contactedSlipPending + contactedBooked + contactedLost;
log("  SUM", bucketSum, ok(bucketSum === contactedYes));
if (bucketSum !== contactedYes) {
  // Find contacted-yes rows that fall into NO bucket
  const missing = contactedYesRows.filter((r) => {
    const a = r.status === "pre_survey" && !r.sales_pitch_at && r.pre_slip_uploaded !== 1;
    const b = r.status === "pre_survey" && r.sales_pitch_at && r.pre_slip_uploaded !== 1;
    const c = r.status === "pre_survey-01" || (r.status === "pre_survey" && r.pre_slip_uploaded === 1);
    const d = !!r.booking_paid_at;
    const e = r.status === "lost";
    return !(a || b || c || d || e);
  });
  console.log(`  ↳ leaked: ${missing.length} leads not in any bucket. IDs: ${sample(missing, 10)}`);
  console.log("    statuses:", [...new Set(missing.map((r) => r.status))].join(", "));
  // Find rows in MULTIPLE buckets (overlap)
  const overlap = contactedYesRows.filter((r) => {
    let n = 0;
    if (r.status === "pre_survey" && !r.sales_pitch_at && r.pre_slip_uploaded !== 1) n++;
    if (r.status === "pre_survey" && r.sales_pitch_at && r.pre_slip_uploaded !== 1) n++;
    if (r.status === "pre_survey-01" || (r.status === "pre_survey" && r.pre_slip_uploaded === 1)) n++;
    if (r.booking_paid_at) n++;
    if (r.status === "lost") n++;
    return n > 1;
  });
  if (overlap.length) console.log(`  ↳ overlap: ${overlap.length} leads counted >1x. IDs: ${sample(overlap, 10)}`);
}

// Cross-check: contactedBooked vs bookingPaidCount
console.log("\nCROSS-CHECK: contactedBooked vs bookingPaidCount");
log("  contactedBooked", contactedBooked);
log("  bookingPaidCount", bookingPaidCount);
if (contactedBooked !== bookingPaidCount) {
  const ghosts = bookingPaidRows.filter((r) => !states(r).some((s) => s === "yes"));
  console.log(`  ↳ ${ghosts.length} booking-paid leads have NO contact state = 'yes'`);
  console.log(`    IDs: ${sample(ghosts, 10)}`);
}

console.log("\n========== ROW 2 — ชำระจองสำรวจ + 9 stages ==========\n");
log("Total bookingPaid", bookingPaidCount);
log("  รอนัดสำรวจ (pre_survey-02)", stepWaitSurvey);
log("  นัดสำรวจ", stepSurveyScheduled);
log("  กำลังสำรวจ", stepSurveying);
log("  รอใบเสนอราคา", stepWaitQuote);
log("  ได้ใบเสนอราคา", orderRows.length, `(${orderUnpaid}·${orderPaidPartial}·${orderPaidFull})`);
log("  นัดติดตั้ง", stepInstallScheduled);
log("  กำลังติดตั้ง", stepInstalling);
log("  ติดตั้งเสร็จ", stepDone);
log("  ยกเลิกหลังจอง", stepLostAfter);
const stageSum = stepWaitSurvey + stepSurveyScheduled + stepSurveying + stepWaitQuote + orderRows.length + stepInstallScheduled + stepInstalling + stepDone + stepLostAfter;
log("  SUM", stageSum, ok(stageSum === bookingPaidCount));

if (stageSum !== bookingPaidCount) {
  console.log("\n  ↳ stage-by-status breakdown of bookingPaid rows:");
  const byStatus = {};
  for (const r of bookingPaidRows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  for (const [s, n] of Object.entries(byStatus)) console.log(`     ${s.padEnd(24)} ${n}`);
}

// stepWaitSurvey trap: counted via countsByStatus (not bookingPaidRows filter)
const waitSurveyAlt = bookingPaidRows.filter((r) => r.status === "pre_survey-02").length;
console.log("\n  CROSS-CHECK stepWaitSurvey:");
log("    countsByStatus['pre_survey-02']", stepWaitSurvey);
log("    bookingPaidRows.filter(pre_survey-02)", waitSurveyAlt);
if (stepWaitSurvey !== waitSurveyAlt) {
  console.log(`    ↳ DIFF: ${stepWaitSurvey - waitSurveyAlt} pre_survey-02 lead(s) have NO booking_paid_at`);
}

// orderRows sub-buckets
const orderSubSum = orderUnpaid + orderPaidPartial + orderPaidFull;
console.log("\n  ใบเสนอราคา sub-breakdown");
log("    Total orderRows", orderRows.length);
log("    ยังไม่จ่าย", orderUnpaid);
log("    มัดจำ", orderPaidPartial);
log("    ครบ", orderPaidFull);
log("    SUM", orderSubSum, ok(orderSubSum === orderRows.length));

console.log("\n========== STATUS DISTRIBUTION (lifecycle page raw) ==========\n");
for (const [s, n] of Object.entries(countsByStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(24)} ${String(n).padStart(4)}`);
}
console.log(`  ${"TOTAL".padEnd(24)} ${String(totalLeads).padStart(4)}`);

await pool.close();
