import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Aggregated payload for the seeker dashboard. Replaces the old approach of
// shipping every prospect row to the client (which broke at ~6k rows). All
// counts and the daily chart are computed in a single round-trip; the client
// just renders.
//
// `cardStatus` parity with src/app/(app)/seeker/dashboard/page.tsx:cardStatus —
// any change to the JS rules must mirror here, otherwise totals will drift.
const STATUS_CASE = `
  CASE
    WHEN p.interest = 'interested' THEN 'interested'
    WHEN p.interest = 'not_interested' THEN 'not_interested'
    WHEN p.interest IN ('not_home','undecided')
      OR p.visited_at IS NOT NULL
      OR (p.note IS NOT NULL AND LEN(LTRIM(RTRIM(p.note))) > 0)
      THEN 'contacted'
    ELSE 'pending'
  END
`;

const HAS_SOLAR_CASE = `
  CASE WHEN
    (p.existing_solar IS NOT NULL AND LEN(LTRIM(RTRIM(p.existing_solar))) > 0
      AND p.existing_solar NOT LIKE 'ไม่มี%' AND p.existing_solar NOT LIKE 'ยังไม่มี%'
      AND LOWER(p.existing_solar) NOT IN ('no','none','-'))
    OR (p.installed_kw IS NOT NULL AND p.installed_kw > 0)
    OR (p.installed_product IS NOT NULL AND LEN(LTRIM(RTRIM(p.installed_product))) > 0)
  THEN 1 ELSE 0 END
`;

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const project = req.nextUrl.searchParams.get("project");
    const db = await getDb();
    const projectFilter = project ? "AND p.project_name = @project" : "";

    // Top-level totals: one pass over the table with conditional aggregates.
    const totalsReq = db.request();
    if (project) totalsReq.input("project", sql.NVarChar(200), project);
    const totalsRes = await totalsReq.query(`
      SELECT
        COUNT(*) AS total,
        ISNULL(SUM(CASE WHEN ${STATUS_CASE} = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        ISNULL(SUM(CASE WHEN ${STATUS_CASE} = 'contacted' THEN 1 ELSE 0 END), 0) AS contacted,
        ISNULL(SUM(CASE WHEN ${STATUS_CASE} = 'interested' THEN 1 ELSE 0 END), 0) AS interested,
        ISNULL(SUM(CASE WHEN ${STATUS_CASE} = 'not_interested' THEN 1 ELSE 0 END), 0) AS not_interested,
        ISNULL(SUM(CASE WHEN p.interest = 'interested' AND p.interest_type = 'new' THEN 1 ELSE 0 END), 0) AS interested_new,
        ISNULL(SUM(CASE WHEN p.interest = 'interested' AND p.interest_type = 'upgrade' THEN 1 ELSE 0 END), 0) AS interested_upgrade,
        ISNULL(SUM(CASE WHEN p.interest = 'undecided' THEN 1 ELSE 0 END), 0) AS undecided,
        ISNULL(SUM(CASE WHEN p.interest = 'not_home' THEN 1 ELSE 0 END), 0) AS not_home,
        ISNULL(SUM(${HAS_SOLAR_CASE}), 0) AS has_solar,
        ISNULL(SUM(CASE WHEN p.line_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS line_linked,
        ISNULL(SUM(CASE WHEN p.lead_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS leads_created
      FROM prospects p
      WHERE 1=1 ${projectFilter}
    `);

    // Per-project rollup. Includes every active project from `projects` even
    // when no prospect references it yet — so seekers can see "empty" projects
    // they haven't started canvassing. Names also union with whatever legacy
    // free-text project_name strings exist on prospects.
    const byProjectRes = await db.request().query(`
      ;WITH project_names AS (
        SELECT name, ISNULL(is_pinned, 0) AS is_pinned FROM projects WHERE is_active = 1
        UNION
        SELECT DISTINCT COALESCE(NULLIF(p.project_name, N''), pr.name) AS name, 0 AS is_pinned
        FROM prospects p LEFT JOIN projects pr ON pr.id = p.project_id
        WHERE COALESCE(NULLIF(p.project_name, N''), pr.name) IS NOT NULL
      ),
      project_dedup AS (
        SELECT name, MAX(CAST(is_pinned AS INT)) AS is_pinned
        FROM project_names GROUP BY name
      ),
      prospect_named AS (
        -- For pinned projects (e.g. "โครงการอื่นทั่วไป") we ALWAYS group by
        -- pr.name so every free-text project_name typed by users still rolls
        -- up into the catch-all bucket. Non-pinned rows keep the legacy
        -- COALESCE behaviour where project_name overrides.
        SELECT p.*,
          CASE
            WHEN ISNULL(pr.is_pinned, 0) = 1 THEN pr.name
            ELSE COALESCE(NULLIF(p.project_name, N''), pr.name)
          END AS resolved_name
        FROM prospects p LEFT JOIN projects pr ON pr.id = p.project_id
      )
      SELECT
        pn.name,
        pn.is_pinned,
        COUNT(p.id) AS total,
        ISNULL(SUM(CASE WHEN p.id IS NOT NULL AND ${STATUS_CASE} = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        ISNULL(SUM(CASE WHEN p.id IS NOT NULL AND ${STATUS_CASE} = 'contacted' THEN 1 ELSE 0 END), 0) AS contacted,
        ISNULL(SUM(CASE WHEN p.id IS NOT NULL AND ${STATUS_CASE} = 'interested' THEN 1 ELSE 0 END), 0) AS interested,
        ISNULL(SUM(CASE WHEN p.id IS NOT NULL AND ${STATUS_CASE} = 'not_interested' THEN 1 ELSE 0 END), 0) AS not_interested
      FROM project_dedup pn
      LEFT JOIN prospect_named p ON p.resolved_name = pn.name
      GROUP BY pn.name, pn.is_pinned
      ORDER BY pn.is_pinned DESC, COUNT(p.id) DESC, pn.name
    `);

    // Recent visits — used to fill the bottom list. TOP 10 keeps it cheap.
    const recentReq = db.request();
    if (project) recentReq.input("project", sql.NVarChar(200), project);
    const recentRes = await recentReq.query(`
      SELECT TOP 10
        p.id, p.house_number, p.full_name, p.visited_at, p.visit_lat, p.visit_lng,
        p.line_id, p.lead_id,
        ${STATUS_CASE} AS status,
        COALESCE(NULLIF(p.project_name, N''), pr.name) AS project_name,
        u.full_name AS visited_by_name
      FROM prospects p
      LEFT JOIN projects pr ON pr.id = p.project_id
      LEFT JOIN users u ON u.id = p.visited_by
      WHERE p.visited_at IS NOT NULL ${projectFilter}
      ORDER BY p.visited_at DESC
    `);

    // Daily chart data — all-time (every day with at least one visit). The
    // dashboard label/bar count is sized client-side from the earliest day in
    // the response so the chart shows actual usage span, not a fixed 30-day
    // window that under- or over-claims relative to the KPIs above it.
    const dailyReq = db.request();
    if (project) dailyReq.input("project", sql.NVarChar(200), project);
    const dailyRes = await dailyReq.query(`
      SELECT
        CONVERT(NVARCHAR(10), p.visited_at, 23) AS day,
        SUM(CASE WHEN ${STATUS_CASE} = 'interested' THEN 1 ELSE 0 END) AS interested,
        SUM(CASE WHEN ${STATUS_CASE} = 'contacted' THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN ${STATUS_CASE} = 'not_interested' THEN 1 ELSE 0 END) AS not_interested,
        SUM(CASE WHEN ${STATUS_CASE} = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM prospects p
      WHERE p.visited_at IS NOT NULL
        ${projectFilter}
      GROUP BY CONVERT(NVARCHAR(10), p.visited_at, 23)
    `);

    // Project options for the dashboard picker — only projects that already
    // have at least one prospect (the dashboard charts go blank otherwise).
    // We still surface pinned projects first so they pop to the top.
    const optionsRes = await db.request().query(`
      ;WITH resolved AS (
        SELECT DISTINCT COALESCE(NULLIF(p.project_name, N''), pr.name) AS name,
               ISNULL(pr.is_pinned, 0) AS is_pinned
        FROM prospects p LEFT JOIN projects pr ON pr.id = p.project_id
        WHERE COALESCE(NULLIF(p.project_name, N''), pr.name) IS NOT NULL
      )
      SELECT name FROM resolved
      GROUP BY name
      ORDER BY MAX(CAST(is_pinned AS INT)) DESC, name
    `);

    return NextResponse.json({
      totals: totalsRes.recordset[0],
      by_project: byProjectRes.recordset,
      recent_visits: fixDates(recentRes.recordset),
      daily: dailyRes.recordset,
      project_options: optionsRes.recordset.map((r: { name: string }) => r.name).filter(Boolean),
    });
  } catch (error) {
    console.error("GET /api/seeker-summary error:", error);
    return NextResponse.json({ error: "Failed to fetch seeker summary" }, { status: 500 });
  }
}
