import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    const request = db.request().input("id", sql.Int, parseInt(id));
    const sets: string[] = [];

    if (body.project_id !== undefined) {
      sets.push("project_id = @project_id");
      request.input("project_id", sql.Int, body.project_id);
    }
    if (body.project_name !== undefined) {
      sets.push("project_name = @project_name");
      request.input("project_name", sql.NVarChar(200), body.project_name);
    }
    if (body.house_number !== undefined) {
      sets.push("house_number = @house_number");
      request.input("house_number", sql.NVarChar(50), body.house_number);
    }
    if (body.full_name !== undefined) {
      sets.push("full_name = @full_name");
      request.input("full_name", sql.NVarChar(200), body.full_name);
    }
    if (body.phone !== undefined) {
      sets.push("phone = @phone");
      request.input("phone", sql.NVarChar(20), body.phone);
    }
    if (body.app_status !== undefined) {
      sets.push("app_status = @app_status");
      request.input("app_status", sql.NVarChar(50), body.app_status);
    }
    if (body.existing_solar !== undefined) {
      sets.push("existing_solar = @existing_solar");
      request.input("existing_solar", sql.NVarChar(50), body.existing_solar);
    }
    if (body.installed_kw !== undefined) {
      sets.push("installed_kw = @installed_kw");
      request.input("installed_kw", sql.Decimal(8, 2), body.installed_kw);
    }
    if (body.installed_product !== undefined) {
      sets.push("installed_product = @installed_product");
      request.input("installed_product", sql.NVarChar(200), body.installed_product);
    }
    if (body.ev_charger !== undefined) {
      sets.push("ev_charger = @ev_charger");
      request.input("ev_charger", sql.NVarChar(100), body.ev_charger);
    }
    let isVisit = false;
    if (body.interest !== undefined) {
      sets.push("interest = @interest");
      request.input("interest", sql.NVarChar(20), body.interest);
      sets.push("visited_at = GETDATE()");
      isVisit = true;
    }
    if (body.interest_type !== undefined) {
      sets.push("interest_type = @interest_type");
      request.input("interest_type", sql.NVarChar(20), body.interest_type);
      isVisit = true;
    }
    if (body.note !== undefined) {
      sets.push("note = @note");
      request.input("note", sql.NVarChar(sql.MAX), body.note);
      isVisit = true;
    }
    if (body.visit_lat !== undefined) {
      sets.push("visit_lat = @visit_lat");
      request.input("visit_lat", sql.Decimal(10, 7), body.visit_lat);
    }
    if (body.visit_lng !== undefined) {
      sets.push("visit_lng = @visit_lng");
      request.input("visit_lng", sql.Decimal(10, 7), body.visit_lng);
    }
    if (body.visited_by !== undefined) {
      sets.push("visited_by = @visited_by");
      request.input("visited_by", sql.Int, body.visited_by);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (isVisit) {
      sets.push("visit_count = visit_count + 1");
    }
    sets.push("updated_at = GETDATE()");

    const result = await request.query(`
      UPDATE prospects SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }
    return NextResponse.json(fixDates(result.recordset)[0]);
  } catch (error) {
    console.error("PATCH /api/prospects/[id] error:", error);
    return NextResponse.json({ error: "Failed to update prospect" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = await getDb();
    await db.request().input("id", sql.Int, parseInt(id)).query(`DELETE FROM prospects WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/prospects/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete prospect" }, { status: 500 });
  }
}
