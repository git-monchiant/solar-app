import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    const projectName = req.nextUrl.searchParams.get("project_name");
    const interest = req.nextUrl.searchParams.get("interest");
    const channel = req.nextUrl.searchParams.get("channel");
    // Slim mode drops bulky free-text columns (note, contacts JSON, interest
    // reason note). Used by the seeker dashboard, which only needs flags +
    // counts and was hauling ~5 MB of unused text per page load.
    const slim = req.nextUrl.searchParams.get("slim") === "1";
    const db = await getDb();
    const request = db.request();
    const where: string[] = [];
    if (projectId) {
      where.push("p.project_id = @project_id");
      request.input("project_id", sql.Int, parseInt(projectId));
    }
    if (projectName) {
      where.push("p.project_name = @project_name");
      request.input("project_name", sql.NVarChar(200), projectName);
    }
    if (interest) {
      if (interest === "pending") {
        where.push("p.interest IS NULL");
      } else {
        where.push("p.interest = @interest");
        request.input("interest", sql.NVarChar(20), interest);
      }
    }
    if (channel) {
      // Match prospects whose first-touchpoint source is X OR who carry X as
      // an additional tag.
      where.push("(p.prospect_source = @source OR p.tag LIKE @tagLike)");
      request.input("source", sql.NVarChar(20), channel);
      request.input("tagLike", sql.NVarChar(40), `%"${channel}"%`);
    }
    // Substring search on house_number — used by seeker landing page to let
    // users check if a house already exists across any project before they
    // start creating a new prospect. Exact matches surface first.
    const houseQ = req.nextUrl.searchParams.get("house_q");
    let houseQActive = false;
    if (houseQ && houseQ.trim().length >= 2) {
      where.push("p.house_number LIKE @house_q");
      request.input("house_q", sql.NVarChar(60), `%${houseQ.trim()}%`);
      request.input("house_q_exact", sql.NVarChar(60), houseQ.trim());
      houseQActive = true;
    }
    const limitParam = req.nextUrl.searchParams.get("limit");
    const topClause = limitParam ? `TOP ${Math.max(1, Math.min(200, parseInt(limitParam) || 50))}` : "";
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    // For slim mode, return CASE expressions that flatten free-text into a
    // single bit / null string so the rest of the schema stays unchanged for
    // clients that already type-check on it.
    const noteSql = slim ? "CASE WHEN p.note IS NOT NULL AND LEN(LTRIM(RTRIM(p.note))) > 0 THEN N'' ELSE NULL END AS note" : "p.note";
    const contactsSql = slim ? "CAST(NULL AS NVARCHAR(MAX)) AS contacts" : "p.contacts";
    const reasonNoteSql = slim ? "CAST(NULL AS NVARCHAR(MAX)) AS interest_reason_note" : "p.interest_reason_note";
    const result = await request.query(`
      SELECT ${topClause} p.id, p.project_id, p.seq, p.house_number, p.full_name, p.phone,
             p.app_status, p.existing_solar, p.installed_kw, p.installed_product, p.ev_charger,
             p.interest, p.interest_type, ${noteSql}, p.visited_by, p.visited_at, p.visit_count, p.visit_lat, p.visit_lng, p.line_id, p.contact_time, p.interest_reasons, ${reasonNoteSql}, p.interest_sizes, p.returned_at, p.lead_id, ${contactsSql}, p.prospect_source, p.tag, p.project_alias, p.email, p.the1_id, p.created_at, p.updated_at,
             COALESCE(NULLIF(p.project_name, N''), pr.name) as project_name,
             u.full_name as visited_by_name,
             lu.display_name as line_display_name,
             lu.picture_url as line_picture_url,
             l.payment_confirmed as lead_payment_confirmed,
             l.pre_total_price as lead_pre_total_price,
             l.pre_doc_no as lead_pre_doc_no
      FROM prospects p
      LEFT JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN users u ON p.visited_by = u.id
      LEFT JOIN line_users lu ON lu.line_user_id = p.line_id
      LEFT JOIN leads l ON l.id = p.lead_id
      ${whereSql}
      ORDER BY ${houseQActive ? "CASE WHEN p.house_number = @house_q_exact THEN 0 ELSE 1 END, LEN(p.house_number), p.house_number, " : ""}p.created_at DESC
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/prospects error:", error);
    return NextResponse.json({ error: "Failed to fetch prospects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    const db = await getDb();
    const result = await db.request()
      .input("project_id", sql.Int, body.project_id || null)
      .input("project_name", sql.NVarChar(200), body.project_name || null)
      .input("seq", sql.Int, body.seq || null)
      .input("house_number", sql.NVarChar(50), body.house_number || null)
      .input("full_name", sql.NVarChar(200), body.full_name || null)
      .input("phone", sql.NVarChar(20), body.phone || null)
      .input("app_status", sql.NVarChar(50), body.app_status || null)
      .input("existing_solar", sql.NVarChar(50), body.existing_solar || null)
      .input("installed_kw", sql.Decimal(8, 2), body.installed_kw ?? null)
      .input("installed_product", sql.NVarChar(200), body.installed_product || null)
      .input("ev_charger", sql.NVarChar(100), body.ev_charger || null)
      // prospect_source is the first-touch channel — set once at insert and
      // never updated. tag is the editable JSON array of additional touchpoints.
      .input("prospect_source", sql.NVarChar(20), body.prospect_source || null)
      .input("tag", sql.NVarChar(500), Array.isArray(body.tag) && body.tag.length > 0 ? JSON.stringify(body.tag) : null)
      .query(`
        INSERT INTO prospects (project_id, project_name, seq, house_number, full_name, phone, app_status, existing_solar, installed_kw, installed_product, ev_charger, prospect_source, tag)
        OUTPUT INSERTED.*
        VALUES (@project_id, @project_name, @seq, @house_number, @full_name, @phone, @app_status, @existing_solar, @installed_kw, @installed_product, @ev_charger, @prospect_source, @tag)
      `);
    const created = result.recordset[0];
    // Audit: who created this prospect. Failure here doesn't block the create.
    try {
      await db.request()
        .input("pid", sql.Int, created.id)
        .input("by", sql.Int, gate.userId)
        .query(`INSERT INTO prospect_activities (prospect_id, activity_type, title, created_by)
                VALUES (@pid, 'created', N'Prospect created', @by)`);
    } catch (e) {
      console.error("prospect_activities create failed", e);
    }
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/prospects error:", error);
    return NextResponse.json({ error: "Failed to create prospect" }, { status: 500 });
  }
}
