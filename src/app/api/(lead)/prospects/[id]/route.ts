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
    if (body.lead_id !== undefined) {
      sets.push("lead_id = @lead_id");
      request.input("lead_id", sql.Int, body.lead_id);
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
    // Auto-stamp visited_by from the authenticated user when the seeker UI
    // sets interest but doesn't pass an explicit visited_by. Without this
    // every "interested" prospect ends up with visited_by = NULL (the cause
    // of the audit gap we found in May 2026).
    if (body.interest !== undefined && body.visited_by === undefined) {
      sets.push("visited_by = @visited_by_auto");
      request.input("visited_by_auto", sql.Int, gate.userId);
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
    if (body.line_id !== undefined) {
      sets.push("line_id = @line_id");
      request.input("line_id", sql.NVarChar(100), body.line_id);
    }
    if (body.contact_time !== undefined) {
      sets.push("contact_time = @contact_time");
      request.input("contact_time", sql.NVarChar(100), body.contact_time);
    }
    if (body.interest_reasons !== undefined) {
      sets.push("interest_reasons = @interest_reasons");
      request.input("interest_reasons", sql.NVarChar(500), body.interest_reasons);
    }
    if (body.interest_reason_note !== undefined) {
      sets.push("interest_reason_note = @interest_reason_note");
      request.input("interest_reason_note", sql.NVarChar(sql.MAX), body.interest_reason_note);
    }
    if (body.interest_sizes !== undefined) {
      sets.push("interest_sizes = @interest_sizes");
      request.input("interest_sizes", sql.NVarChar(100), body.interest_sizes);
    }
    if (body.returned_at !== undefined) {
      sets.push("returned_at = @returned_at");
      request.input("returned_at", sql.DateTime2, body.returned_at);
    }
    if (body.project_alias !== undefined) {
      sets.push("project_alias = @project_alias");
      request.input("project_alias", sql.NVarChar(200), (body.project_alias || "").trim() || null);
    }
    // Updating extra-touchpoint tags. prospect_source is immutable post-insert
    // (it represents how the customer was first acquired), so any incoming
    // `prospect_source` field on a PATCH is silently ignored.
    if (body.tag !== undefined) {
      const arr = Array.isArray(body.tag)
        ? body.tag.map((c: unknown) => String(c).trim()).filter(Boolean)
        : [];
      sets.push("tag = @tag");
      request.input("tag", sql.NVarChar(500), arr.length > 0 ? JSON.stringify(arr) : null);
    }
    // Multi-person households: `contacts` is a JSON array of {name, phone}.
    // When sent, we also mirror contacts[0] into full_name/phone so existing
    // list/map/search queries that read those columns keep working unchanged.
    if (body.contacts !== undefined) {
      const arr = Array.isArray(body.contacts) ? body.contacts : null;
      const clean = arr
        ? arr
            .map((c: { name?: string | null; phone?: string | null }) => ({
              name: (c?.name ?? "").toString().trim() || null,
              phone: (c?.phone ?? "").toString().trim() || null,
            }))
            .filter((c: { name: string | null; phone: string | null }) => c.name || c.phone)
        : null;
      const json = clean && clean.length > 0 ? JSON.stringify(clean) : null;
      sets.push("contacts = @contacts");
      request.input("contacts", sql.NVarChar(sql.MAX), json);
      // Only mirror primary if client did not explicitly set full_name/phone
      // in the same request (explicit overrides win).
      if (body.full_name === undefined) {
        sets.push("full_name = @full_name_from_contacts");
        request.input("full_name_from_contacts", sql.NVarChar(200), clean?.[0]?.name ?? null);
      }
      if (body.phone === undefined) {
        sets.push("phone = @phone_from_contacts");
        request.input("phone_from_contacts", sql.NVarChar(20), clean?.[0]?.phone ?? null);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (isVisit) {
      sets.push("visit_count = visit_count + 1");
    }
    sets.push("updated_at = GETDATE()");

    // Snapshot the audited fields BEFORE the UPDATE so we can diff and write
    // activity rows afterwards. Cheap point read on a primary-key lookup.
    const beforeRes = await db.request().input("idSnap", sql.Int, parseInt(id))
      .query(`SELECT interest, interest_type, note, lead_id, project_id, house_number FROM prospects WHERE id = @idSnap`);
    const prev: Record<string, unknown> = beforeRes.recordset[0] || {};

    const result = await request.query(`
      UPDATE prospects SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }
    const next = result.recordset[0];

    // Mirror line_id onto the linked lead so the LINE push API (which reads
    // leads.line_id) sees the same binding the seeker UI just wrote.
    // Without this the QR-link flow looks "saved" but ส่ง LINE → 400.
    if (body.line_id !== undefined && next.lead_id) {
      await db.request()
        .input("lid", sql.Int, next.lead_id)
        .input("line_id", sql.NVarChar(100), body.line_id)
        .query(`UPDATE leads SET line_id = @line_id WHERE id = @lid`);
    }

    // Write activity rows for the diffs we care about. Failures here MUST
    // NOT fail the request — audit is a secondary concern.
    type Act = { type: string; old: string | null; new: string | null; title: string | null };
    const acts: Act[] = [];
    const str = (v: unknown) => v == null ? null : String(v).slice(0, 500);

    if (body.interest !== undefined && prev.interest !== next.interest) {
      acts.push({ type: "interest_change", old: str(prev.interest), new: str(next.interest), title: `interest: ${prev.interest ?? "-"} → ${next.interest ?? "-"}` });
    }
    if (body.interest_type !== undefined && prev.interest_type !== next.interest_type) {
      acts.push({ type: "interest_type_change", old: str(prev.interest_type), new: str(next.interest_type), title: null });
    }
    if (body.note !== undefined && prev.note !== next.note) {
      acts.push({ type: "note_change", old: str(prev.note), new: str(next.note), title: null });
    }
    if (body.lead_id !== undefined && prev.lead_id !== next.lead_id) {
      acts.push({ type: "lead_link", old: str(prev.lead_id), new: str(next.lead_id), title: next.lead_id ? `ผูก Lead #${next.lead_id}` : `ปลด Lead` });
    }
    if ((body.project_id !== undefined || body.house_number !== undefined) && (prev.project_id !== next.project_id || prev.house_number !== next.house_number)) {
      acts.push({ type: "house_change", old: `${prev.project_id ?? "-"}/${prev.house_number ?? "-"}`, new: `${next.project_id ?? "-"}/${next.house_number ?? "-"}`, title: null });
    }

    for (const a of acts) {
      try {
        await db.request()
          .input("pid", sql.Int, parseInt(id))
          .input("type", sql.NVarChar(50), a.type)
          .input("title", sql.NVarChar(500), a.title)
          .input("old", sql.NVarChar(500), a.old)
          .input("new", sql.NVarChar(500), a.new)
          .input("by", sql.Int, gate.userId)
          .query(`INSERT INTO prospect_activities (prospect_id, activity_type, title, old_value, new_value, created_by)
                  VALUES (@pid, @type, @title, @old, @new, @by)`);
      } catch (e) {
        console.error("prospect_activities insert failed", e);
      }
    }

    return NextResponse.json(fixDates([next])[0]);
  } catch (error) {
    console.error("PATCH /api/prospects/[id] error:", error);
    // SQL unique-index violation on (project_id, house_number) — surface as
    // 409 with a readable message so the client can show "house already taken"
    // instead of a silent 500.
    const msg = error instanceof Error ? error.message : "";
    if (/UX_prospects_project_house|duplicate key/i.test(msg)) {
      return NextResponse.json(
        { error: "บ้านเลขที่นี้มีอยู่แล้วในโครงการนี้", code: "DUPLICATE_HOUSE" },
        { status: 409 },
      );
    }
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
