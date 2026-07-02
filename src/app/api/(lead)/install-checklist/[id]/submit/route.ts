import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// POST /api/install-checklist/[id]/submit
//
// Finalizes the checklist: stamps submitted_at to now. Caller should have
// PATCHed the body first (signatures, function tests, etc.) — this endpoint
// only flips the submitted flag.
//
// Idempotent on the server side: if submitted_at is already set, we keep the
// original timestamp (don't bump). Client should usually treat this as a
// one-time action and disable the button afterwards.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const db = await getDb();
    // Only stamp if not already submitted. UPDATE on missing row inserts
    // nothing; we expect a prior PATCH to have created the row. Treat
    // missing row as "no checklist data" and refuse.
    const check = await db.request()
      .input("lead_id", sql.Int, leadId)
      .query(`SELECT lead_id, submitted_at FROM install_checklists WHERE lead_id = @lead_id`);
    if (check.recordset.length === 0) {
      return NextResponse.json({ error: "ยังไม่ได้บันทึก checklist — กรอกข้อมูลก่อนกดส่งมอบ" }, { status: 400 });
    }
    if (check.recordset[0].submitted_at) {
      return NextResponse.json({ error: "Checklist ถูกส่งมอบไปแล้ว" }, { status: 409 });
    }

    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("updated_by_id", sql.Int, gate.userId)
      .query(`
        UPDATE install_checklists
        SET submitted_at = SYSUTCDATETIME(),
            updated_at   = SYSUTCDATETIME(),
            updated_by_id = @updated_by_id
        WHERE lead_id = @lead_id
      `);

    const fresh = await db.request().input("lead_id", sql.Int, leadId).query(`
      SELECT * FROM install_checklists WHERE lead_id = @lead_id
    `);
    return NextResponse.json(fixDates(fresh.recordset)[0]);
  } catch (e) {
    console.error("POST /api/install-checklist/[id]/submit error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
