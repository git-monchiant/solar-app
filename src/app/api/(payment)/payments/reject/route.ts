// Accountant (or admin) rejects a submitted slip group. Deletes every
// staging slip_files row for the given lead+slip_field, stamps a per-field
// note on leads.payment_reject_notes (JSON keyed by slip_field), and logs a
// payment_rejected activity. The uploader sees the reason in their slot;
// once they re-upload + click ยืนยัน 1 (which clears the note via the slip
// submit handler), the banner disappears.
import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { notifyLeadOwner, resolveAccountingNotifications } from "@/lib/accounting-notifications";

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const userId = gate.userId;

  try {
    const body = await req.json() as { lead_id?: number; slip_field?: string; reason?: string };
    const leadId = Number(body.lead_id);
    const slipField = String(body.slip_field || "").trim();
    const reason = String(body.reason || "").trim();
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    }
    if (!slipField) {
      return NextResponse.json({ error: "slip_field required" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }

    const db = await getDb();

    // Who is rejecting — fetch full_name for the audit trail. Fall back to id.
    const userRow = await db.request().input("id", sql.Int, userId)
      .query(`SELECT full_name, username FROM users WHERE id = @id`);
    const by = userRow.recordset[0]?.full_name || userRow.recordset[0]?.username || `user#${userId}`;

    // Load current notes JSON so we can merge the new entry instead of replacing.
    const cur = await db.request()
      .input("id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`
        SELECT l.payment_reject_notes,
          (SELECT TOP 1 p.submitted_by
           FROM payments p
           WHERE p.lead_id = l.id AND p.slip_field = @slip_field AND p.confirmed_at IS NULL
           ORDER BY p.id DESC) submitted_by
        FROM leads l WHERE l.id = @id
      `);
    if (cur.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    let notes: Record<string, { reason: string; by: string; at: string }> = {};
    try {
      const raw = cur.recordset[0].payment_reject_notes;
      if (raw) notes = JSON.parse(raw);
      if (!notes || typeof notes !== "object" || Array.isArray(notes)) notes = {};
    } catch { notes = {}; }
    notes[slipField] = { reason, by, at: new Date().toISOString() };

    // A cheque that Accounting already received has been moved from staging
    // into an unconfirmed payments row. Remove that interim row (and its
    // embedded evidence) so the uploader gets a genuinely fresh Step 5 slot.
    // Confirmed payment rows are never touched by rejection.
    const receivedChequeDelete = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`
        DELETE FROM payments
        WHERE lead_id = @lead_id AND slip_field = @slip_field
          AND confirmed_at IS NULL AND cheque_received_at IS NOT NULL
      `);

    // Wipe staging slips for this lead + slip_field (the "ถอย" action).
    // Confirmed slip_files (if any) are kept — rejection only targets the
    // submitted-but-unconfirmed set the accountant sees in their queue.
    const del = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`DELETE FROM slip_files WHERE lead_id = @lead_id AND slip_field = @slip_field`);

    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`UPDATE payments SET cheque_received_at = NULL, cheque_received_by = NULL,
                cheque_deposited_at = NULL, cheque_status = 'cancelled',
                cheque_status_note = N'รายการถูกตีกลับจากคิวตรวจสอบ', cheque_status_at = GETDATE()
              WHERE lead_id = @lead_id AND slip_field = @slip_field AND confirmed_at IS NULL`);

    // Persist the merged notes JSON.
    await db.request()
      .input("id", sql.Int, leadId)
      .input("notes", sql.NVarChar(sql.MAX), JSON.stringify(notes))
      .query(`UPDATE leads SET payment_reject_notes = @notes, updated_at = GETDATE() WHERE id = @id`);

    // Activity log so the timeline reflects the rejection.
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("by", sql.Int, userId)
      .input("title", sql.NVarChar(200), `ปฏิเสธสลิป — ${slipField}`)
      .input("note", sql.NVarChar(sql.MAX), reason)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by, created_at)
        VALUES (@lead_id, 'payment_rejected', @title, @note, @by, GETDATE())
      `);

    await resolveAccountingNotifications(db, { leadId, slipField })
      .catch((error) => console.error("resolve accounting notification failed:", error));
    await notifyLeadOwner(db, {
      leadId,
      slipField,
      type: "sale_payment_rejected",
      title: "บัญชีส่งหลักฐานชำระเงินกลับ",
      message: reason,
      createdBy: userId,
      submittedBy: cur.recordset[0]?.submitted_by ?? null,
    }).catch((error) => console.error("create Sale payment notification failed:", error));

    return NextResponse.json({
      ok: true,
      deleted_slip_files: del.rowsAffected[0],
      deleted_received_cheques: receivedChequeDelete.rowsAffected[0],
    });
  } catch (e) {
    console.error("POST /api/payments/reject error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
