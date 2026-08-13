import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { computeStageCode, getStatusLabel } from "@/lib/constants/statuses";
import { toLegacyStageCode } from "@/lib/journey-rules.mjs";
import { flipJourneyDatesIfDue } from "@/lib/journey";

// GET /api/v1/bi/leads
//
// Service endpoint for the BI dashboard team. Returns the full lead row
// plus a couple of computed conveniences (stage_code, status_label) so BI
// doesn't need to re-implement our workflow taxonomy.
//
// Auth: static API key in the `Authorization: Bearer <key>` header. The
// key lives in the `SENA_IDEA_API_KEY` env var — one shared key gates
// this endpoint AND the inbound capture endpoint. Rotate by updating
// .env and restarting the container. This is intentionally NOT tied to
// the user-session auth (`x-user-id`) because BI tools run headless.
//
// Query params:
//   ?since=YYYY-MM-DD   — updated_at >= since. Enables incremental sync.
//   ?limit=1000         — 1..5000. Default 1000.
//   ?offset=0           — pagination cursor. Default 0.
//   ?status=quote,order — comma-separated status filter. Optional.
//
// Response shape:
//   { items: [...], total, limit, offset, has_more, generated_at }
//
// Fields excluded from the payload (privacy/access):
//   - password_hash (never leaves the row via any API)
//   - id_card_photo_url / house_reg_photo_url / signatures
//   - slip URLs (private files, requires auth to access anyway)
// Personal identifiers (phone, email, id_card_number) ARE included — the
// BI team's dashboard runs inside the corporate perimeter and needs them
// to correlate against other systems (LINE, Google Sheet).

export const runtime = "nodejs";

function unauthorized(msg: string) {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function GET(req: NextRequest) {
  // 1. Auth — Bearer token in Authorization header (preferred) OR ?key=xxx
  // query param (for browser paste / quick testing). Both must match
  // SENA_IDEA_API_KEY (shared with the inbound capture endpoint).
  const expected = process.env.SENA_IDEA_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "SENA_IDEA_API_KEY not configured on server" }, { status: 500 });
  }
  const header = req.headers.get("authorization") || "";
  const [scheme, headerToken] = header.split(" ");
  const queryToken = req.nextUrl.searchParams.get("key");
  const token = (scheme === "Bearer" ? headerToken : "") || queryToken || "";
  if (!token) return unauthorized("Missing token (use Authorization: Bearer <key> header or ?key=<key> query param)");
  if (token !== expected) return unauthorized("Invalid token");

  // 2. Params
  const url = req.nextUrl;
  const since = url.searchParams.get("since");
  const status = url.searchParams.get("status");
  const idParam = url.searchParams.get("id");
  const idList = idParam
    ? idParam.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0).slice(0, 100)
    : [];
  const rawLimit = parseInt(url.searchParams.get("limit") || "1000");
  const rawOffset = parseInt(url.searchParams.get("offset") || "0");
  const limit = Math.max(1, Math.min(5000, Number.isFinite(rawLimit) ? rawLimit : 1000));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  // 3. Build WHERE clause. `applyInputs()` wires each param onto a fresh
  // sql.Request — we need to do this twice (count query + page query).
  const where: string[] = [];
  const applyInputs = (r: sql.Request) => {
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) r.input("since", sql.DateTime, d);
    }
    if (status) {
      const codes = status.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
      codes.forEach((c, i) => r.input(`s${i}`, sql.NVarChar(50), c));
    }
    idList.forEach((id, i) => r.input(`id${i}`, sql.Int, id));
  };
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) where.push("l.updated_at >= @since");
  }
  if (status) {
    const codes = status.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (codes.length > 0) {
      const placeholders = codes.map((_, i) => `@s${i}`).join(",");
      where.push(`l.status IN (${placeholders})`);
    }
  }
  if (idList.length > 0) {
    const placeholders = idList.map((_, i) => `@id${i}`).join(",");
    where.push(`l.id IN (${placeholders})`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const db = await getDb();
    await flipJourneyDatesIfDue(db);

    // 4. Count
    const countReq = db.request();
    applyInputs(countReq);
    const countRes = await countReq.query(`SELECT COUNT(*) AS n FROM dbo.leads l ${whereSql}`);
    const total = countRes.recordset[0]?.n ?? 0;

    // 5. Page. `SELECT l.*` gives BI the full schema — new columns light up
    //    automatically without a code change here. Contact + milestone
    //    aggregates come from correlated subqueries + a contacts CTE so BI
    //    doesn't need to fan out per lead. Patterns mirror
    //    /api/lifecycle so dashboards stay consistent.
    const pageReq = db.request();
    applyInputs(pageReq);
    pageReq.input("limit", sql.Int, limit);
    pageReq.input("offset", sql.Int, offset);
    const contactStateExpr = (alias: string) => `
      CASE
        WHEN ${alias}.title LIKE N'ติดต่อไม่ได้%'                                THEN 'no'
        WHEN ${alias}.title LIKE N'ติดต่อได้%'                                   THEN 'yes'
        WHEN ${alias}.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
        ELSE NULL
      END`;
    const pageRes = await pageReq.query(`
      ;WITH raw_contacts AS (
        SELECT lead_id, created_at, activity_type, title,
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
        l.*,
        -- Contact activity aggregates. "contact" activities are any outbound
        -- attempt the sales team logs (call / visit / LINE / other / follow_up).
        -- state derives from the title prefix ("ติดต่อได้" / "ติดต่อไม่ได้")
        -- falling back to activity_type ⇒ "yes" for hard channels (call/visit).
        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id
            AND activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
        ) AS contact_first_at,
        (SELECT MAX(created_at) FROM lead_activities
          WHERE lead_id = l.id
            AND activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
        ) AS contact_last_at,
        (SELECT COUNT(*) FROM lead_activities
          WHERE lead_id = l.id
            AND activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
        ) AS contact_total,
        (SELECT COUNT(*) FROM lead_activities
          WHERE lead_id = l.id
            AND (title LIKE N'ติดต่อได้%'
              OR (title NOT LIKE N'ติดต่อไม่ได้%'
                AND activity_type IN ('call','visit','line','line_sent','loan_followup')))
        ) AS contact_success,
        (SELECT COUNT(*) FROM lead_activities
          WHERE lead_id = l.id
            AND title LIKE N'ติดต่อไม่ได้%'
        ) AS contact_fail,
        (SELECT COUNT(*) FROM lead_activities WHERE lead_id = l.id) AS activity_total,
        -- Latest scheduled follow-up (activities with a future followup_date).
        (SELECT MIN(followup_date) FROM lead_activities
          WHERE lead_id = l.id AND followup_date IS NOT NULL AND followup_date >= CAST(GETDATE() AS DATE)
        ) AS follow_up_next_at,

        -- Sequential contact attempts 1-5 (matches /api/lifecycle).
        c1.created_at AS contact1_at, ${contactStateExpr("c1")} AS contact1_state,
        c2.created_at AS contact2_at, ${contactStateExpr("c2")} AS contact2_state,
        c3.created_at AS contact3_at, ${contactStateExpr("c3")} AS contact3_state,
        c4.created_at AS contact4_at, ${contactStateExpr("c4")} AS contact4_state,
        c5.created_at AS contact5_at, ${contactStateExpr("c5")} AS contact5_state,

        -- Sales pitch — the first "เสนอขาย" activity, fallback to survey slip
        -- submission (customer wouldn't pay a deposit without hearing a pitch).
        COALESCE(
          (SELECT MIN(created_at) FROM lead_activities
            WHERE lead_id = l.id AND title LIKE N'%เสนอขาย%'),
          (SELECT MIN(submitted_at) FROM payments
            WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL)
        ) AS sales_pitch_at,

        -- Lifecycle milestone timestamps derived from status_change activities.
        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='quote') AS survey_done_at,
        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='order') AS quote_issued_at,
        (SELECT MIN(confirmed_at) FROM payments
          WHERE lead_id = l.id AND slip_field LIKE 'order[_]%' AND confirmed_at IS NOT NULL) AS order_paid_at,
        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='install') AS install_started_at,
        (SELECT MIN(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='warranty') AS warranty_at,
        -- When the lead was marked lost (status→lost). lost_reason already
        -- comes with l.*.
        (SELECT MAX(created_at) FROM lead_activities
          WHERE lead_id = l.id AND activity_type='status_change' AND new_status='lost') AS lost_at,

        -- Sales owner
        u.full_name  AS assigned_name,
        u.email      AS assigned_email
      FROM dbo.leads l
      LEFT JOIN users u ON l.assigned_user_id = u.id
      LEFT JOIN contacts c1 ON c1.lead_id = l.id AND c1.rn = 1
      LEFT JOIN contacts c2 ON c2.lead_id = l.id AND c2.rn = 2
      LEFT JOIN contacts c3 ON c3.lead_id = l.id AND c3.rn = 3
      LEFT JOIN contacts c4 ON c4.lead_id = l.id AND c4.rn = 4
      LEFT JOIN contacts c5 ON c5.lead_id = l.id AND c5.rn = 5
      ${whereSql}
      ORDER BY l.id
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    // 6. Sanitize + enrich. Strip fields BI shouldn't touch: password hashes,
    // signatures, ID photos, house reg photos, payment slips, and every
    // photo URL from survey/install (BI displays aggregates, not documents).
    // We drop by exact name AND by name pattern so new signature/photo/slip
    // columns added later are dropped by default.
    const STRIP = new Set([
      "password_hash",
      "id_card_photo_url",
      "house_reg_photo_url",
    ]);
    const STRIP_PATTERNS = [
      /_signature(_url|_data|_mime)?$/,   // *_customer_signature_url / _data / _mime
      /^survey_photo/,                      // survey_photo_building_url etc.
      /^survey_photos/,                     // survey_photos, survey_photos_extra
      /^install_photos/,                    // install_photos, install_photos_extra
      /_slip(_url)?$/,                      // pre_slip_url, order_before_slip
      /^receipt_.*_url$/,                   // receipt_deposit_actual_url etc.
      /^warranty_.*(cert|serials|sn_photo|other_docs)_url$/,
      /^grid_document_checklist$/,
      /^grid_application_doc_url$/,
      /^grid_permit_doc_url$/,
      /^warranty_doc_url$/,
    ];
    const rows = fixDates(pageRes.recordset).map((r: Record<string, unknown>) => {
      for (const k of Object.keys(r)) {
        if (STRIP.has(k)) { delete r[k]; continue; }
        if (STRIP_PATTERNS.some(p => p.test(k))) delete r[k];
      }
      // Add computed convenience columns.
      const status = String(r.status || "");
      const install_date = r.install_date as string | null;
      const survey_date = r.survey_date as string | null;
      const install_completed_at = r.install_completed_at as string | null;
      const order_paid_count = (r.order_paid_count as number | null) ?? 0;
      // stage_code (legacy "MM-S") มาจากคอลัมน์ journey ที่ persist แล้ว —
      // fallback คำนวณสดเฉพาะแถวที่ยังไม่มีค่า (ไม่ควรเกิดหลัง backfill)
      const journeyStep = (r.journey_step as number | null) ?? null;
      r.stage_code = journeyStep != null
        ? toLegacyStageCode({ step: journeyStep, sub: (r.journey_sub as number | null) ?? 0 })
        : computeStageCode({ status, install_date, survey_date, install_completed_at, order_paid_count });
      r.status_label = getStatusLabel({ status, install_date, order_paid_count });
      return r;
    });

    return NextResponse.json({
      items: rows,
      total,
      limit,
      offset,
      has_more: offset + rows.length < total,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("GET /api/v1/bi/leads error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
