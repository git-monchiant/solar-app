import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logLeadActivity, paymentStepLabel, fmtBaht } from "@/lib/lead-activity-log";
import { notifyAccountingRole, resolveAccountingNotifications } from "@/lib/accounting-notifications";

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

// PATCH /api/slips/<id>  body: { submit: true, payment_detail?: string }
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
      const paymentDetail = typeof body.payment_detail === "string" ? body.payment_detail.trim() : "";
      const before = await db.request().input("id", sql.Int, slipId)
        .query(`
          SELECT sf.lead_id, sf.slip_field, sf.submitted_at,
                 p.id AS payment_id, p.payment_method, p.description, p.step_no, p.amount
          FROM slip_files sf
          OUTER APPLY (
            SELECT TOP 1 id, payment_method, description, step_no, amount
            FROM payments
            WHERE lead_id = sf.lead_id
              AND slip_field = sf.slip_field
              AND confirmed_at IS NULL
            ORDER BY id DESC
          ) p
          WHERE sf.id = @id
        `);
      const row = before.recordset[0];
      if (!row) return NextResponse.json({ error: "ไม่พบหลักฐานการชำระเงิน" }, { status: 404 });
      if ((row.payment_method === "loan" || row.payment_method === "other") && !paymentDetail) {
        return NextResponse.json({ error: "กรุณากรอกรายละเอียดการชำระก่อนส่งให้ฝ่ายบัญชี" }, { status: 400 });
      }
      if (paymentDetail.length > 150) {
        return NextResponse.json({ error: "รายละเอียดการชำระต้องไม่เกิน 150 ตัวอักษร" }, { status: 400 });
      }
      const upd = await db.request().input("id", sql.Int, slipId)
        .query(`UPDATE slip_files SET submitted_at = GETDATE() WHERE id = @id AND submitted_at IS NULL`);
      if (row && upd.rowsAffected[0] > 0) {
        // Stamp step 1 author on the payment row so Timeline doesn't have to
        // scrape the activity log later. Only the FIRST submit wins so re-
        // submission (after a revert) keeps the original attribution intact.
        const baseDescription = String(row.description || "").replace(/\s*·\s*ชำระโดย:[\s\S]*$/, "").trim();
        const persistedDescription = paymentDetail
          ? `${baseDescription}${baseDescription ? " · " : ""}ชำระโดย: ${paymentDetail}`.slice(0, 200)
          : null;
        await db.request()
          .input("lead_id", sql.Int, row.lead_id)
          .input("slip_field", sql.NVarChar(50), row.slip_field)
          .input("submitted_by", sql.Int, gate.userId)
          .input("description", sql.NVarChar(200), persistedDescription)
          .query(`UPDATE payments SET submitted_by = @submitted_by, submitted_at = GETDATE(),
                    description = CASE WHEN @description IS NOT NULL THEN @description ELSE description END
                  WHERE lead_id = @lead_id AND slip_field = @slip_field AND submitted_at IS NULL`);
        await logLeadActivity(db, {
          leadId: row.lead_id,
          activityType: "slip_submitted",
          title: `ตรวจสลิป ${paymentStepLabel(row.slip_field)} (รอบัญชียืนยัน)`,
          userId: gate.userId,
        });
        const cheque = row.payment_method === "cheque";
        await notifyAccountingRole(db, {
          paymentId: row.payment_id,
          leadId: row.lead_id,
          slipField: row.slip_field,
          type: cheque ? "account_cheque_waiting_receive" : "account_payment_waiting_review",
          title: cheque ? "มีเช็ครอรับ" : "มีหลักฐานชำระเงินรอตรวจสอบ",
          message: `${paymentStepLabel(row.slip_field, row.step_no)}${row.amount ? ` · ${fmtBaht(Number(row.amount))}` : ""}`,
          createdBy: gate.userId,
        }).catch((error) => console.error("create accounting notification failed:", error));
        // Clear any prior rejection note for this slip_field — uploader has
        // resubmitted, so the "ไม่อนุมัติ: …" banner should disappear. Read
        // → mutate JSON in-app → write; SQL Server JSON support is awkward.
        const noteRow = await db.request().input("lead_id", sql.Int, row.lead_id)
          .query(`SELECT payment_reject_notes FROM leads WHERE id = @lead_id`);
        const raw = noteRow.recordset[0]?.payment_reject_notes;
        if (raw) {
          let notes: Record<string, unknown> = {};
          try { notes = JSON.parse(raw); } catch { notes = {}; }
          if (notes && typeof notes === "object" && row.slip_field in notes) {
            delete (notes as Record<string, unknown>)[row.slip_field];
            const next = Object.keys(notes).length === 0 ? null : JSON.stringify(notes);
            await db.request()
              .input("lead_id", sql.Int, row.lead_id)
              .input("notes", sql.NVarChar(sql.MAX), next)
              .query(`UPDATE leads SET payment_reject_notes = @notes WHERE id = @lead_id`);
          }
        }
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
        const remaining = await db.request()
          .input("lead_id", sql.Int, row.lead_id)
          .input("slip_field", sql.NVarChar(50), row.slip_field)
          .query(`SELECT COUNT_BIG(*) count FROM slip_files
                  WHERE lead_id = @lead_id AND slip_field = @slip_field AND submitted_at IS NOT NULL`);
        if (Number(remaining.recordset[0]?.count || 0) === 0) {
          await resolveAccountingNotifications(db, { leadId: row.lead_id, slipField: row.slip_field })
            .catch((error) => console.error("resolve accounting notification failed:", error));
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
    if (row) {
      const remaining = await db.request()
        .input("lead_id", sql.Int, row.lead_id)
        .input("slip_field", sql.NVarChar(50), row.slip_field)
        .query(`SELECT COUNT_BIG(*) count FROM slip_files
                WHERE lead_id = @lead_id AND slip_field = @slip_field AND submitted_at IS NOT NULL`);
      if (Number(remaining.recordset[0]?.count || 0) === 0) {
        await resolveAccountingNotifications(db, { leadId: row.lead_id, slipField: row.slip_field })
          .catch((error) => console.error("resolve accounting notification failed:", error));
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
