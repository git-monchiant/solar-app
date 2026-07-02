import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// /api/install-checklist/[id]
//
// Lazy row creation: GET returns an empty shell when no row exists yet so the
// form can render a fresh state. PATCH does an UPSERT so the first edit
// auto-creates the row. Same pattern as lead_data.
//
// Storage: install_checklists (migration 044). 1:1 with leads.lead_id.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const db = await getDb();
    const r = await db.request()
      .input("lead_id", sql.Int, leadId)
      .query(`
        SELECT
          lead_id,
          inspection_date,
          system_specs,
          visual_checks,
          function_tests,
          notes,
          inspector_signature_url,
          customer_signature_url,
          submitted_at,
          created_at, updated_at, updated_by_id
        FROM install_checklists
        WHERE lead_id = @lead_id
      `);
    if (r.recordset.length === 0) {
      // Return a stub with the lead id so the client can still hydrate the
      // form without a separate "not-found" branch. PATCH will INSERT on
      // first write.
      return NextResponse.json({
        lead_id: leadId,
        inspection_date: null,
        system_specs: null,
        visual_checks: null,
        function_tests: null,
        notes: null,
        inspector_signature_url: null,
        customer_signature_url: null,
        submitted_at: null,
      });
    }
    return NextResponse.json(fixDates(r.recordset)[0]);
  } catch (e) {
    console.error("GET /api/install-checklist/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;

    // Whitelist + type map. JSON columns accept either a string (already-
    // stringified) or an object/array (we stringify here). Headers stay as
    // typed values.
    type LcEntry = { col: string; sqlType: sql.ISqlType | sql.ISqlTypeFactory; value: unknown; json?: boolean };
    const fields: LcEntry[] = [];
    const push = (col: string, sqlType: sql.ISqlType | sql.ISqlTypeFactory, value: unknown, json = false) => {
      if (value === undefined) return;
      fields.push({ col, sqlType, value: json && typeof value !== "string" && value !== null ? JSON.stringify(value) : value, json });
    };
    // doc_no lives on leads.install_checklist_doc_no — minted via
    // /api/leads/[id]/doc-no/mint?type=install_checklist. Don't accept it here.
    push("inspection_date",         sql.Date,              body.inspection_date);
    push("system_specs",            sql.NVarChar(sql.MAX), body.system_specs,   true);
    push("visual_checks",           sql.NVarChar(sql.MAX), body.visual_checks,  true);
    push("function_tests",          sql.NVarChar(sql.MAX), body.function_tests, true);
    push("notes",                   sql.NVarChar(sql.MAX), body.notes);
    push("inspector_signature_url", sql.NVarChar(500),     body.inspector_signature_url);
    push("customer_signature_url",  sql.NVarChar(500),     body.customer_signature_url);

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = await getDb();

    // MERGE so the first write upserts. We never UPDATE submitted_at here —
    // that's only set via the /submit endpoint. updated_at + updated_by_id
    // are stamped server-side.
    const reqDb = db.request().input("lead_id", sql.Int, leadId);
    for (const f of fields) reqDb.input(f.col, f.sqlType as never, f.value as never);
    reqDb.input("updated_by_id", sql.Int, gate.userId);
    const setClauses = fields.map(f => `${f.col} = @${f.col}`).join(", ");
    const insertCols = ["lead_id", ...fields.map(f => f.col), "created_at", "updated_at", "updated_by_id"].join(", ");
    const insertVals = ["@lead_id", ...fields.map(f => `@${f.col}`), "SYSUTCDATETIME()", "SYSUTCDATETIME()", "@updated_by_id"].join(", ");
    await reqDb.query(`
      MERGE INTO install_checklists WITH (HOLDLOCK) AS t
      USING (SELECT @lead_id AS lead_id) AS s ON t.lead_id = s.lead_id
      WHEN MATCHED THEN UPDATE SET ${setClauses}, updated_at = SYSUTCDATETIME(), updated_by_id = @updated_by_id
      WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals});
    `);

    // Echo the row back so the client doesn't need a follow-up GET.
    const fresh = await db.request().input("lead_id", sql.Int, leadId).query(`
      SELECT * FROM install_checklists WHERE lead_id = @lead_id
    `);
    return NextResponse.json(fixDates(fresh.recordset)[0]);
  } catch (e) {
    console.error("PATCH /api/install-checklist/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
