import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/lifecycle  → matrix of milestone dates per lead, one row per lead.
// Each column is the FIRST time a milestone was reached so the row tells a
// monotonic story (later columns can never be earlier than earlier ones).
//
// Column → source:
//   created_at         leads.created_at
//   first_contact_at   created_at of the EARLIEST contact activity (call /
//                      visit / line / other / follow_up / loan_followup /
//                      line_sent). Falls back to leads.created_at when no
//                      contact activity exists but a survey-deposit slip has
//                      been submitted (the customer was obviously contacted).
//   first_contact_state  'yes' = clearly contacted (call/visit/line/etc, OR
//                      follow_up titled "ติดต่อได้ - ..."); 'no' = explicit
//                      failure ("ติดต่อไม่ได้ - ..."); null = unknown (e.g.
//                      activity logged as "อื่นๆ"). When the slip-submitted
//                      fallback fires, state is 'yes'.
//   sales_pitch_at     MIN(lead_activities.created_at) WHERE title contains
//                      "เสนอขาย" (logged from the "เสนอขายแล้ว" outcome button).
//                      Falls back to the survey-deposit slip submission date —
//                      if sales submitted the slip, the customer was already
//                      pitched.
//   booking_paid_at    MIN(payments.confirmed_at) WHERE slip_field='pre_slip_url'
//                      — moment the survey deposit was confirmed by accounting.
//   survey_date        leads.survey_date (scheduled visit)
//   survey_done_at     MIN(status_change.created_at) WHERE new_status='quote'
//                      — survey closed, quotation phase started.
//   quote_issued_at    MIN(status_change.created_at) WHERE new_status='order'
//                      — quotation accepted, order phase started.
//   order_paid_at      MIN(payments.confirmed_at) WHERE slip_field LIKE 'order_%'
//                      — first order payment (deposit or full) was confirmed.
//   install_date       leads.install_date (scheduled install)
//   install_started_at MIN(status_change.created_at) WHERE new_status='install'
//   install_done_at    leads.install_completed_at
//   warranty_at        MIN(status_change.created_at) WHERE new_status='warranty'
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    // Rank up to 5 contact attempts per lead. The "contact" set covers every
    // outbound channel sales might log: explicit follow-up entries, calls,
    // visits, LINE messages, etc.
    // Title prefix wins over activity_type — sales sometimes log a "call"
    // attempt that ended with "ติดต่อไม่ได้ - ไม่รับสาย"; the channel succeeded
    // (they did try to call) but the outcome was a miss. The outcome is what
    // we report.
    const contactStateExpr = (alias: string) => `
      CASE
        WHEN ${alias}.title LIKE N'ติดต่อไม่ได้%'                                THEN 'no'
        WHEN ${alias}.title LIKE N'ติดต่อได้%'                                   THEN 'yes'
        WHEN ${alias}.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
        ELSE NULL
      END`;
    const r = await db.request().query(`
      ;WITH raw_contacts AS (
        SELECT lead_id, created_at, activity_type, title,
          -- Compress same-day events into one — sending five LINE messages or
          -- making three calls on the same day is one "contact attempt", not
          -- five. The earliest event of the day wins (so its type/title is
          -- what drives the ✓/✗ state).
          ROW_NUMBER() OVER (PARTITION BY lead_id, CAST(created_at AS DATE) ORDER BY created_at ASC) AS day_rn
        FROM lead_activities
        WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
      ),
      contacts AS (
        SELECT lead_id, created_at, activity_type, title,
          ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at ASC) AS rn
        FROM raw_contacts
        WHERE day_rn = 1
      )
      SELECT
        l.id,
        l.house_number,
        l.full_name,
        l.source,
        l.phone,
        l.status,
        l.customer_grade,
        l.customer_group,
        l.created_at,
        l.survey_date,
        l.install_date,
        l.pre_doc_no,
        l.payment_confirmed,
        l.lost_reason,
        l.order_installments,
        l.order_total,
        l.order_discount_amount,
        l.install_extra_cost,
        l.pre_total_price,
        u.full_name AS assigned_name,
        -- Confirmed payment amount + date per installment + booking deposit,
        -- packaged as a JSON array so the Excel export can spread them across
        -- paired columns without extra SQL fan-out. slip_field carries the slot
        -- key; the client knows whether to label it "ค่าสำรวจ" or "งวด N".
        (
          SELECT slip_field, amount, confirmed_at
          FROM payments
          WHERE lead_id = l.id AND confirmed_at IS NOT NULL
            AND (slip_field = 'pre_slip_url' OR slip_field LIKE 'order_installment_%')
          ORDER BY
            CASE WHEN slip_field = 'pre_slip_url' THEN -1
                 ELSE TRY_CAST(SUBSTRING(slip_field, 19, 10) AS INT) END
          FOR JSON PATH
        ) AS payment_dates_json,
        l.payment_followup_date,
        (SELECT COUNT(*) FROM payments
          WHERE lead_id = l.id AND slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL) AS order_paid_count,
        l.install_completed_at AS install_done_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM slip_files
          WHERE lead_id = l.id AND slip_field = 'pre_slip_url'
        ) OR EXISTS (
          SELECT 1 FROM payments
          WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL
        ) THEN 1 ELSE 0 END AS pre_slip_uploaded,

        -- Contact 1 has a special fallback: if no activity logged but a survey
        -- deposit slip was submitted, the customer must have been contacted —
        -- attribute that contact to the lead's creation date.
        COALESCE(c1.created_at,
          CASE WHEN EXISTS (
            SELECT 1 FROM payments
            WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL
          ) THEN l.created_at END
        ) AS first_contact_at,
        CASE
          WHEN c1.title LIKE N'ติดต่อไม่ได้%'                                THEN 'no'
          WHEN c1.title LIKE N'ติดต่อได้%'                                   THEN 'yes'
          WHEN c1.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
          WHEN c1.activity_type IS NULL AND EXISTS (
            SELECT 1 FROM payments
            WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL
          ) THEN 'yes'
          ELSE NULL
        END AS first_contact_state,

        c2.created_at AS contact2_at, ${contactStateExpr("c2")} AS contact2_state,
        c3.created_at AS contact3_at, ${contactStateExpr("c3")} AS contact3_state,
        c4.created_at AS contact4_at, ${contactStateExpr("c4")} AS contact4_state,
        c5.created_at AS contact5_at, ${contactStateExpr("c5")} AS contact5_state,

        COALESCE(
          (SELECT MIN(created_at) FROM lead_activities
            WHERE lead_id = l.id AND title LIKE N'%เสนอขาย%'),
          (SELECT MIN(submitted_at) FROM payments
            WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL)
        ) AS sales_pitch_at,

        -- ฟรีค่าสำรวจ skips the slip flow → no payments row exists. Fall back
        -- to pre_booked_at (set by /book when free is picked) so the lifecycle
        -- column still tracks "จองสำรวจ" — semantically the booking happened,
        -- just at 0 ฿.
        COALESCE(
          (SELECT MIN(confirmed_at) FROM payments
            WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL),
          CASE WHEN l.pre_survey_fee_type = 'free' AND l.payment_confirmed = 1 THEN l.pre_booked_at END
        ) AS booking_paid_at,

        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='quote') AS survey_done_at,

        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='order') AS quote_issued_at,

        (SELECT MIN(confirmed_at) FROM payments
          WHERE lead_id = l.id AND slip_field LIKE 'order[_]%' AND confirmed_at IS NOT NULL) AS order_paid_at,

        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='install') AS install_started_at,

        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='warranty') AS warranty_at

      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_user_id
      LEFT JOIN contacts c1 ON c1.lead_id = l.id AND c1.rn = 1
      LEFT JOIN contacts c2 ON c2.lead_id = l.id AND c2.rn = 2
      LEFT JOIN contacts c3 ON c3.lead_id = l.id AND c3.rn = 3
      LEFT JOIN contacts c4 ON c4.lead_id = l.id AND c4.rn = 4
      LEFT JOIN contacts c5 ON c5.lead_id = l.id AND c5.rn = 5
      ORDER BY l.created_at DESC
    `);
    return NextResponse.json(fixDates(r.recordset));
  } catch (error) {
    console.error("GET /api/lifecycle error:", error);
    return NextResponse.json({ error: "Failed to fetch lifecycle data" }, { status: 500 });
  }
}
