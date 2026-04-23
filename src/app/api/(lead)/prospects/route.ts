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
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await request.query(`
      SELECT p.id, p.project_id, p.seq, p.house_number, p.full_name, p.phone,
             p.app_status, p.existing_solar, p.installed_kw, p.installed_product, p.ev_charger,
             p.interest, p.interest_type, p.note, p.visited_by, p.visited_at, p.visit_count, p.visit_lat, p.visit_lng, p.line_id, p.contact_time, p.interest_reasons, p.interest_reason_note, p.interest_sizes, p.returned_at, p.lead_id, p.created_at, p.updated_at,
             COALESCE(NULLIF(p.project_name, N''), pr.name) as project_name,
             u.full_name as visited_by_name
      FROM prospects p
      LEFT JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN users u ON p.visited_by = u.id
      ${whereSql}
      ORDER BY p.created_at DESC
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
      .query(`
        INSERT INTO prospects (project_id, project_name, seq, house_number, full_name, phone, app_status, existing_solar, installed_kw, installed_product, ev_charger)
        OUTPUT INSERTED.*
        VALUES (@project_id, @project_name, @seq, @house_number, @full_name, @phone, @app_status, @existing_solar, @installed_kw, @installed_product, @ev_charger)
      `);
    return NextResponse.json(result.recordset[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/prospects error:", error);
    return NextResponse.json({ error: "Failed to create prospect" }, { status: 500 });
  }
}
