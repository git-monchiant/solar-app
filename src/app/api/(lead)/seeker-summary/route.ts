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

    // Per-project rollup. Always returns every project (filter is only on the
    // top-level totals view) so the "By project" panel keeps showing context.
    const byProjectRes = await db.request().query(`
      SELECT
        COALESCE(NULLIF(p.project_name, N''), pr.name, N'— ไม่ระบุ —') AS name,
        COUNT(*) AS total,
        SUM(CASE WHEN ${STATUS_CASE} = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN ${STATUS_CASE} = 'contacted' THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN ${STATUS_CASE} = 'interested' THEN 1 ELSE 0 END) AS interested,
        SUM(CASE WHEN ${STATUS_CASE} = 'not_interested' THEN 1 ELSE 0 END) AS not_interested
      FROM prospects p
      LEFT JOIN projects pr ON pr.id = p.project_id
      GROUP BY COALESCE(NULLIF(p.project_name, N''), pr.name, N'— ไม่ระบุ —')
      ORDER BY COUNT(*) DESC
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

    // Daily chart data — last 33 days (30 history + 3 future buffer).
    // Future days will simply be empty rows on the client side.
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
        AND p.visited_at >= DATEADD(day, -33, CAST(GETDATE() AS DATE))
        ${projectFilter}
      GROUP BY CONVERT(NVARCHAR(10), p.visited_at, 23)
    `);

    // Project options for the picker — every project that has at least one
    // prospect, sorted alphabetically.
    const optionsRes = await db.request().query(`
      SELECT DISTINCT COALESCE(NULLIF(p.project_name, N''), pr.name) AS name
      FROM prospects p
      LEFT JOIN projects pr ON pr.id = p.project_id
      WHERE COALESCE(NULLIF(p.project_name, N''), pr.name) IS NOT NULL
      ORDER BY name
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
