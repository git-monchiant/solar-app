import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logLeadActivity, paymentStepLabel } from "@/lib/lead-activity-log";

export const runtime = "nodejs";

// GET /api/slips/<id>  → serve binary
// NOTE: <img src=...> can't send custom headers, so this remains public. If we
// later switch to cookie/session auth the middleware can gate it uniformly.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slipId = parseInt(id);
  if (!slipId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, slipId)
      .query(`SELECT data, mime FROM slip_files WHERE id = @id`);
    if (r.recordset.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = r.recordset[0];
    return new NextResponse(row.data, {
      headers: {
        "Content-Type": row.mime || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// PATCH /api/slips/<id>  body: { submit: true }
// Marks the staging slip as "submitted for accountant review" (sets
// submitted_at). Until submitted, the slip is a draft and won't appear
// in the accountant's pending-approval queue.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const slipId = parseInt(id);
  if (!slipId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.submit === true) {
      const db = await getDb();
      const before = await db.request().input("id", sql.Int, slipId)
        .query(`SELECT lead_id, slip_field, submitted_at FROM slip_files WHERE id = @id`);
      const row = before.recordset[0];
      const upd = await db.request().input("id", sql.Int, slipId)
        .query(`UPDATE slip_files SET submitted_at = GETDATE() WHERE id = @id AND submitted_at IS NULL`);
      if (row && upd.rowsAffected[0] > 0) {
        // Stamp step 1 author on the payment row so Timeline doesn't have to
        // scrape the activity log later. Only the FIRST submit wins so re-
        // submission (after a revert) keeps the original attribution intact.
        await db.request()
          .input("lead_id", sql.Int, row.lead_id)
          .input("slip_field", sql.NVarChar(50), row.slip_field)
          .input("submitted_by", sql.Int, gate.userId)
          .query(`UPDATE payments SET submitted_by = @submitted_by, submitted_at = GETDATE()
                  WHERE lead_id = @lead_id AND slip_field = @slip_field AND submitted_at IS NULL`);
        await logLeadActivity(db, {
          leadId: row.lead_id,
          activityType: "slip_submitted",
          title: `ตรวจสลิป ${paymentStepLabel(row.slip_field)} (รอบัญชียืนยัน)`,
          userId: gate.userId,
        });
        // Pre-survey deposit slip submit → advance lead from `pre_survey` (no
        // suffix) to `pre_survey-01` (รอยืนยันรับเงิน). Skip if already at -01
        // or beyond so re-submitting another slip doesn't reset the status.
        if (row.slip_field === "pre_slip_url") {
          await db.request().input("lead_id", sql.Int, row.lead_id)
            .query(`UPDATE leads SET status = 'pre_survey-01', updated_at = GETDATE()
                    WHERE id = @lead_id AND status = 'pre_survey'`);
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (body.submit === false) {
      // Revert to draft so the uploader can edit/replace before resubmitting.
      const db = await getDb();
      const before = await db.request().input("id", sql.Int, slipId)
        .query(`SELECT lead_id, slip_field FROM slip_files WHERE id = @id`);
      const row = before.recordset[0];
      await db.request().input("id", sql.Int, slipId)
        .query(`UPDATE slip_files SET submitted_at = NULL WHERE id = @id`);
      if (row) {
        await logLeadActivity(db, {
          leadId: row.lead_id,
          activityType: "slip_unsubmitted",
          title: `ย้อนสถานะสลิป ${paymentStepLabel(row.slip_field)}`,
          userId: gate.userId,
        });
        // Pre-survey unsubmit → revert status to plain `pre_survey` only when
        // no other submitted slips remain for this lead's deposit.
        if (row.slip_field === "pre_slip_url") {
          await db.request().input("lead_id", sql.Int, row.lead_id)
            .query(`UPDATE leads SET status = 'pre_survey', updated_at = GETDATE()
                    WHERE id = @lead_id AND status = 'pre_survey-01'
                      AND NOT EXISTS (
                        SELECT 1 FROM slip_files sf2
                        WHERE sf2.lead_id = @lead_id
                          AND sf2.slip_field = 'pre_slip_url'
                          AND sf2.submitted_at IS NOT NULL
                      )`);
        }
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "No-op" }, { status: 400 });
  } catch (e) {
    console.error("PATCH /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/slips/<id>  → remove record
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const slipId = parseInt(id);
  if (!slipId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    // Capture lead_id + slip_field before delete so we can revert pre_survey
    // substep if removing the last remaining staging slip resets the queue.
    const before = await db.request().input("id", sql.Int, slipId)
      .query(`SELECT lead_id, slip_field FROM slip_files WHERE id = @id`);
    const row = before.recordset[0];
    await db.request().input("id", sql.Int, slipId).query(`DELETE FROM slip_files WHERE id = @id`);
    // Pre-survey deposit slip removed (admin ถอย) → if no submitted slip left
    // for this lead's deposit, revert status from pre_survey-01 → pre_survey.
    if (row && row.slip_field === "pre_slip_url") {
      await db.request().input("lead_id", sql.Int, row.lead_id)
        .query(`UPDATE leads SET status = 'pre_survey', updated_at = GETDATE()
                WHERE id = @lead_id AND status = 'pre_survey-01'
                  AND NOT EXISTS (
                    SELECT 1 FROM slip_files sf
                    WHERE sf.lead_id = @lead_id
                      AND sf.slip_field = 'pre_slip_url'
                      AND sf.submitted_at IS NOT NULL
                  )`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
