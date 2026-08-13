import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { syncOrderPaidFlags } from "@/lib/payments-helpers";
import { logLeadActivity, paymentStepLabel, fmtBaht } from "@/lib/lead-activity-log";
import { refreshJourneySafe } from "@/lib/journey";
import { notifyAccountingRole, notifyLeadOwner, resolveAccountingNotifications } from "@/lib/accounting-notifications";

export const runtime = "nodejs";

const MAX_SLIPS = 5;

async function getAccountingUser(db: Awaited<ReturnType<typeof getDb>>, userId: number) {
  const result = await db.request().input("uid", sql.Int, userId)
    .query(`SELECT full_name, roles FROM users WHERE id = @uid AND is_active = 1`);
  const user = result.recordset[0];
  let roles: string[] = [];
  try {
    const parsed = user?.roles ? JSON.parse(user.roles) : [];
    if (Array.isArray(parsed)) roles = parsed;
  } catch { roles = []; }
  return roles.includes("admin") || roles.includes("account") ? user : null;
}

// GET /api/payments/<id>
//   default                  → serve slot 1 binary (backward compatible)
//   ?slot=<n>                → serve slot n binary (2..MAX_SLIPS)
//   ?list=1                  → return JSON list of non-empty slots
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  // Image bytes are embedded via <img src=...> tags that can't send custom
  // headers, so the binary branch stays public. The ?list=1 JSON branch is
  // fetched via apiFetch and is gated.
  if (searchParams.get("list")) {
    const gate = await requireAuth(req);
    if (gate.error) return gate.error;
  }

  try {
    const db = await getDb();

    if (searchParams.get("list")) {
      const cols = ["id", "payment_method", "description", "actual_receipt_url", "cheque_received_at", "cheque_received_by", "cheque_bank", "cheque_due_date", "cheque_deposited_at", "cheque_status", "cheque_status_note", "cheque_status_by", "cheque_status_at", "slip_cheque_no"];
      for (let i = 1; i <= MAX_SLIPS; i++) {
        const suffix = i === 1 ? "" : `_${i}`;
        cols.push(`slip_mime${suffix}`, `slip_filename${suffix}`, `DATALENGTH(slip_data${suffix}) AS bytes_${i}`);
      }
      const r = await db.request().input("id", sql.Int, payId)
        .query(`SELECT ${cols.join(", ")} FROM payments WHERE id = @id`);
      if (r.recordset.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const row = r.recordset[0];
      const slots: Array<{ slot: number; url: string; mime: string; filename: string | null; bytes: number }> = [];
      for (let i = 1; i <= MAX_SLIPS; i++) {
        const suffix = i === 1 ? "" : `_${i}`;
        const bytes = row[`bytes_${i}`];
        if (bytes && bytes > 0) {
          slots.push({
            slot: i,
            url: i === 1 ? `/api/payments/${payId}` : `/api/payments/${payId}?slot=${i}`,
            mime: row[`slip_mime${suffix}`] || "image/jpeg",
            filename: row[`slip_filename${suffix}`] || null,
            bytes,
          });
        }
      }
      return NextResponse.json({
        slots,
        payment_method: row.payment_method || null,
        description: row.description || null,
        actual_receipt_url: row.actual_receipt_url || null,
        cheque_received_at: row.cheque_received_at || null,
        cheque_received_by: row.cheque_received_by || null,
        cheque_bank: row.cheque_bank || null,
        cheque_due_date: row.cheque_due_date || null,
        cheque_deposited_at: row.cheque_deposited_at || null,
        cheque_status: row.cheque_status || null,
        cheque_status_note: row.cheque_status_note || null,
        cheque_status_by: row.cheque_status_by || null,
        cheque_status_at: row.cheque_status_at || null,
        cheque_no: row.slip_cheque_no || null,
      });
    }

    const slot = parseInt(searchParams.get("slot") || "1");
    if (slot < 1 || slot > MAX_SLIPS) {
      return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
    }
    const suffix = slot === 1 ? "" : `_${slot}`;
    const r = await db.request().input("id", sql.Int, payId)
      .query(`SELECT slip_data${suffix} AS data, slip_mime${suffix} AS mime FROM payments WHERE id = @id`);
    if (r.recordset.length === 0 || !r.recordset[0].data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = r.recordset[0];
    return new NextResponse(row.data, {
      headers: {
        "Content-Type": row.mime || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// PATCH /api/payments/<id>
//   { actual_receipt_url } → attach/clear scanned "ใบเสร็จตัวจริง"
//   { cheque_received: true } → step 1 for cheque payments: received cheque,
//                               but not actual money yet.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const body = await req.json();
    const db = await getDb();

    if (body.cheque_received === true) {
      const payRes = await db.request()
        .input("id", sql.Int, payId)
        .query(`SELECT lead_id, slip_field, step_no, amount, payment_method, confirmed_at, cheque_received_at FROM payments WHERE id = @id`);
      const pay = payRes.recordset[0];
      if (!pay) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (pay.payment_method !== "cheque") {
        return NextResponse.json({ error: "รองรับเฉพาะรายการรับชำระด้วยเช็ค" }, { status: 400 });
      }
      if (pay.confirmed_at) {
        return NextResponse.json({ error: "รายการนี้ยืนยันรับเงินแล้ว" }, { status: 409 });
      }

      let receivedBy: string | null = null;
      if (gate.userId) {
        const u = await db.request().input("uid", sql.Int, gate.userId)
          .query(`SELECT full_name FROM users WHERE id = @uid`);
        receivedBy = u.recordset[0]?.full_name ?? null;
      }

      await db.request()
        .input("id", sql.Int, payId)
        .input("received_by", sql.NVarChar(100), receivedBy)
        .input("cheque_bank", sql.NVarChar(100), body.cheque_bank ? String(body.cheque_bank).slice(0, 100) : null)
        .input("cheque_due_date", sql.NVarChar(10), /^\d{4}-\d{2}-\d{2}$/.test(String(body.cheque_due_date || "")) ? String(body.cheque_due_date) : null)
        .input("cheque_no", sql.NVarChar(50), body.cheque_no ? String(body.cheque_no).slice(0, 50) : null)
        .query(`UPDATE payments SET
                  cheque_received_at = COALESCE(cheque_received_at, GETDATE()),
                  cheque_received_by = COALESCE(cheque_received_by, @received_by),
                  cheque_bank = COALESCE(@cheque_bank, cheque_bank),
                  cheque_due_date = COALESCE(TRY_CONVERT(date, @cheque_due_date), cheque_due_date),
                  slip_cheque_no = COALESCE(@cheque_no, slip_cheque_no),
                  cheque_deposited_at = NULL,
                  cheque_status = 'received',
                  cheque_status_note = NULL,
                  cheque_status_by = @received_by,
                  cheque_status_at = GETDATE()
                WHERE id = @id`);

      await db.request()
        .input("lead_id", sql.Int, pay.lead_id)
        .input("slip_field", sql.NVarChar(50), pay.slip_field)
        .input("step_no", sql.Int, pay.step_no)
        .input("details", sql.NVarChar(sql.MAX), JSON.stringify({ payment_id: payId, amount: pay.amount }))
        .input("user_id", sql.Int, gate.userId ?? null)
        .query(`INSERT INTO payment_logs (lead_id, action, slip_field, step_no, details, user_id)
                VALUES (@lead_id, 'cheque_received', @slip_field, @step_no, @details, @user_id)`);

      await logLeadActivity(db, {
        leadId: pay.lead_id,
        activityType: "payment_cheque_received",
        title: `รับเช็ค ${paymentStepLabel(pay.slip_field, pay.step_no)} ${fmtBaht(Number(pay.amount || 0))}`,
        userId: gate.userId,
      });

      await refreshJourneySafe(db, pay.lead_id);
      await resolveAccountingNotifications(db, {
        paymentId: payId,
        leadId: pay.lead_id,
        slipField: pay.slip_field,
        types: ["account_cheque_waiting_receive"],
      }).catch((error) => console.error("resolve accounting notification failed:", error));
      if (!pay.cheque_received_at) {
        await notifyAccountingRole(db, {
          paymentId: payId,
          leadId: pay.lead_id,
          slipField: pay.slip_field,
          type: "account_cheque_waiting_money",
          title: "รับเช็คแล้ว รอยืนยันเงินเข้าบริษัท",
          message: `${paymentStepLabel(pay.slip_field, pay.step_no)} · ${fmtBaht(Number(pay.amount || 0))}`,
          createdBy: gate.userId,
        }).catch((error) => console.error("create accounting notification failed:", error));
      }

      return NextResponse.json({ ok: true });
    }

    if (body.update_cheque_details === true || body.cheque_deposited === true || body.cheque_failed) {
      const accountingUser = await getAccountingUser(db, gate.userId);
      if (!accountingUser) return NextResponse.json({ error: "Account only" }, { status: 403 });

      const payRes = await db.request()
        .input("id", sql.Int, payId)
        .query(`SELECT lead_id, slip_field, step_no, amount, payment_method, confirmed_at, cheque_received_at
                FROM payments WHERE id = @id`);
      const pay = payRes.recordset[0];
      if (!pay) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (pay.payment_method !== "cheque") {
        return NextResponse.json({ error: "รองรับเฉพาะรายการรับชำระด้วยเช็ค" }, { status: 400 });
      }
      if (pay.confirmed_at) {
        return NextResponse.json({ error: "รายการนี้ยืนยันรับเงินแล้ว" }, { status: 409 });
      }

      const actionBy = accountingUser.full_name ?? null;
      if (body.update_cheque_details === true) {
        await db.request()
          .input("id", sql.Int, payId)
          .input("cheque_bank", sql.NVarChar(100), body.cheque_bank ? String(body.cheque_bank).slice(0, 100) : null)
          .input("cheque_due_date", sql.NVarChar(10), /^\d{4}-\d{2}-\d{2}$/.test(String(body.cheque_due_date || "")) ? String(body.cheque_due_date) : null)
          .input("cheque_no", sql.NVarChar(50), body.cheque_no ? String(body.cheque_no).slice(0, 50) : null)
          .input("action_by", sql.NVarChar(100), actionBy)
          .query(`UPDATE payments SET
                    cheque_bank = @cheque_bank,
                    cheque_due_date = TRY_CONVERT(date, @cheque_due_date),
                    slip_cheque_no = COALESCE(@cheque_no, slip_cheque_no),
                    cheque_status_by = @action_by,
                    cheque_status_at = GETDATE()
                  WHERE id = @id`);
        return NextResponse.json({ ok: true });
      }

      if (body.cheque_deposited === true) {
        if (!pay.cheque_received_at) return NextResponse.json({ error: "ต้องยืนยันรับเช็คก่อน" }, { status: 409 });
        await db.request()
          .input("id", sql.Int, payId)
          .input("action_by", sql.NVarChar(100), actionBy)
          .query(`UPDATE payments SET
                    cheque_deposited_at = COALESCE(cheque_deposited_at, GETDATE()),
                    cheque_status = 'deposited',
                    cheque_status_note = NULL,
                    cheque_status_by = @action_by,
                    cheque_status_at = GETDATE()
                  WHERE id = @id`);
        await logLeadActivity(db, {
          leadId: pay.lead_id,
          activityType: "payment_cheque_deposited",
          title: `นำฝากเช็ค ${paymentStepLabel(pay.slip_field, pay.step_no)} ${fmtBaht(Number(pay.amount || 0))}`,
          userId: gate.userId,
        });
        return NextResponse.json({ ok: true });
      }

      const failedStatus = body.cheque_failed === "bounced" ? "bounced" : body.cheque_failed === "cancelled" ? "cancelled" : null;
      if (!failedStatus) return NextResponse.json({ error: "Invalid cheque status" }, { status: 400 });
      const statusNote = body.note ? String(body.note).slice(0, 500) : null;
      await db.request()
        .input("id", sql.Int, payId)
        .input("status", sql.NVarChar(20), failedStatus)
        .input("note", sql.NVarChar(500), statusNote)
        .input("action_by", sql.NVarChar(100), actionBy)
        .query(`UPDATE payments SET
                  cheque_received_at = NULL,
                  cheque_received_by = NULL,
                  cheque_deposited_at = NULL,
                  cheque_status = @status,
                  cheque_status_note = @note,
                  cheque_status_by = @action_by,
                  cheque_status_at = GETDATE()
                WHERE id = @id`);
      await syncOrderPaidFlags(db, pay.lead_id).catch(e => console.error("syncOrderPaidFlags failed:", e));
      await refreshJourneySafe(db, pay.lead_id);
      await logLeadActivity(db, {
        leadId: pay.lead_id,
        activityType: failedStatus === "bounced" ? "payment_cheque_bounced" : "payment_cheque_cancelled",
        title: `${failedStatus === "bounced" ? "เช็คเด้ง" : "ยกเลิกเช็ค"} ${paymentStepLabel(pay.slip_field, pay.step_no)} ${fmtBaht(Number(pay.amount || 0))}`,
        note: statusNote,
        userId: gate.userId,
      });
      await resolveAccountingNotifications(db, { paymentId: payId, leadId: pay.lead_id, slipField: pay.slip_field })
        .catch((error) => console.error("resolve accounting notification failed:", error));
      return NextResponse.json({ ok: true });
    }

    if (body.confirm_received_money === true) {
      const payRes = await db.request()
        .input("id", sql.Int, payId)
        .query(`SELECT lead_id, slip_field, step_no, doc_no, amount, description, payment_method, confirmed_at, cheque_received_at
                FROM payments WHERE id = @id`);
      const pay = payRes.recordset[0];
      if (!pay) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (pay.payment_method !== "cheque") {
        return NextResponse.json({ error: "รองรับเฉพาะรายการรับชำระด้วยเช็ค" }, { status: 400 });
      }
      if (!pay.cheque_received_at) {
        return NextResponse.json({ error: "ต้องยืนยันรับเช็คก่อน" }, { status: 409 });
      }
      if (pay.confirmed_at) {
        return NextResponse.json({ error: "รายการนี้ยืนยันรับเงินแล้ว" }, { status: 409 });
      }

      const user = await getAccountingUser(db, gate.userId);
      if (!user) return NextResponse.json({ error: "Account only" }, { status: 403 });
      const confirmedBy = user.full_name ?? null;

      const slipRes = await db.request()
        .input("lead_id", sql.Int, pay.lead_id)
        .input("slip_field", sql.NVarChar(50), pay.slip_field)
        .query(`
          SELECT TOP (${MAX_SLIPS}) id, data, mime, filename,
                 slip_amount, slip_ref1, slip_ref2, slip_trans_id, slip_datetime,
                 slip_doc_type, slip_cheque_no
          FROM slip_files
          WHERE lead_id = @lead_id AND slip_field = @slip_field AND submitted_at IS NOT NULL
          ORDER BY id ASC
        `);

      const existingSlots = await db.request()
        .input("id", sql.Int, payId)
        .query(`SELECT DATALENGTH(slip_data) AS bytes_1 FROM payments WHERE id = @id`);
      if (slipRes.recordset.length === 0 && !Number(existingSlots.recordset[0]?.bytes_1 || 0)) {
        return NextResponse.json({ error: "ไม่พบหลักฐานเช็คที่ส่งให้บัญชี" }, { status: 400 });
      }

      const tx = new sql.Transaction(db);
      await tx.begin();
      try {
        const firstSlip = slipRes.recordset[0] ?? null;
        const writeReq = new sql.Request(tx)
          .input("id", sql.Int, payId)
          .input("confirmed_by", sql.NVarChar(100), confirmedBy)
          .input("slip_amount", sql.Decimal(12, 2), firstSlip?.slip_amount ?? null)
          .input("slip_ref1", sql.NVarChar(50), firstSlip?.slip_ref1 ?? null)
          .input("slip_ref2", sql.NVarChar(50), firstSlip?.slip_ref2 ?? null)
          .input("slip_trans_id", sql.NVarChar(50), firstSlip?.slip_trans_id ?? null)
          .input("slip_datetime", sql.DateTime2, firstSlip?.slip_datetime ?? null)
          .input("slip_doc_type", sql.NVarChar(20), firstSlip?.slip_doc_type ?? null)
          .input("slip_cheque_no", sql.NVarChar(50), firstSlip?.slip_cheque_no ?? null);

        const setExprs = [
          "confirmed_by = @confirmed_by",
          "confirmed_at = GETDATE()",
          "payment_method = 'cheque'",
          "cheque_status = 'cleared'",
          "cheque_status_note = NULL",
          "cheque_status_by = @confirmed_by",
          "cheque_status_at = GETDATE()",
        ];
        if (firstSlip) {
          setExprs.push(
            "slip_amount = @slip_amount",
            "slip_ref1 = @slip_ref1",
            "slip_ref2 = @slip_ref2",
            "slip_trans_id = @slip_trans_id",
            "slip_datetime = @slip_datetime",
            "slip_doc_type = @slip_doc_type",
            "slip_cheque_no = @slip_cheque_no",
          );
        }
        for (let i = 0; i < MAX_SLIPS; i++) {
          const slip = slipRes.recordset[i] ?? null;
          const suffix = i === 0 ? "" : `_${i + 1}`;
          if (!slip) continue;
          writeReq
            .input(`slip_data${suffix}`, sql.VarBinary(sql.MAX), slip.data)
            .input(`slip_mime${suffix}`, sql.NVarChar(50), slip.mime)
            .input(`slip_filename${suffix}`, sql.NVarChar(200), slip.filename);
          setExprs.push(
            `slip_data${suffix} = @slip_data${suffix}`,
            `slip_mime${suffix} = @slip_mime${suffix}`,
            `slip_filename${suffix} = @slip_filename${suffix}`,
          );
        }

        await writeReq.query(`UPDATE payments SET ${setExprs.join(", ")} WHERE id = @id`);
        await new sql.Request(tx)
          .input("lead_id", sql.Int, pay.lead_id)
          .input("slip_field", sql.NVarChar(50), pay.slip_field)
          .query(`DELETE FROM slip_files WHERE lead_id = @lead_id AND slip_field = @slip_field`);
        await tx.commit();
      } catch (e) {
        try { await tx.rollback(); } catch {}
        throw e;
      }

      await syncOrderPaidFlags(db, pay.lead_id).catch(e => console.error("syncOrderPaidFlags failed:", e));
      await refreshJourneySafe(db, pay.lead_id);
      await logLeadActivity(db, {
        leadId: pay.lead_id,
        activityType: "payment_confirmed",
        title: `ยืนยันรับเงินจากเช็ค ${paymentStepLabel(pay.slip_field, pay.step_no)} ${fmtBaht(Number(pay.amount || 0))}`,
        note: pay.description ?? null,
        userId: gate.userId,
      });
      await resolveAccountingNotifications(db, {
        paymentId: payId,
        leadId: pay.lead_id,
        slipField: pay.slip_field,
        types: ["account_cheque_waiting_money"],
      }).catch((error) => console.error("resolve accounting notification failed:", error));
      await notifyLeadOwner(db, {
        paymentId: payId,
        leadId: pay.lead_id,
        slipField: pay.slip_field,
        type: "sale_payment_approved",
        title: "บัญชีอนุมัติการชำระเงินแล้ว",
        message: `${paymentStepLabel(pay.slip_field, pay.step_no)} · ${fmtBaht(Number(pay.amount || 0))}`,
        createdBy: gate.userId,
      }).catch((error) => console.error("create Sale payment notification failed:", error));
      return NextResponse.json({ ok: true });
    }

    if (Object.prototype.hasOwnProperty.call(body, "actual_receipt_url")) {
      // actual_receipt_url is a JSON array of up to 5 URLs (migration 027). Server
      // stores the string verbatim; client owns serialization (single URL string
      // is also accepted for legacy backwards-compat reads).
      const url = body.actual_receipt_url == null ? null : String(body.actual_receipt_url);
      const result = await db.request()
        .input("id", sql.Int, payId)
        .input("url", sql.NVarChar(sql.MAX), url)
        .query(`UPDATE payments SET actual_receipt_url = @url WHERE id = @id`);
      if (result.rowsAffected[0] === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "No-op" }, { status: 400 });
  } catch (e) {
    console.error("PATCH /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/payments/<id>  → atomic undo of a confirmed payment:
//   1) delete payments row (all slots go with it)
//   2) clear lead paid flag + slip URL
//   3) for pre_slip_url: also clear pre_doc_no/pre_total_price/pre_package_id/pre_booked_at
//   4) revert status if it advanced past the stage
//   5) audit to payment_logs
const PAID_FLAG: Record<string, string> = {
  pre_slip_url: "payment_confirmed",
  order_before_slip: "order_before_paid",
  order_after_slip: "order_after_paid",
};
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const payRes = await db.request().input("id", sql.Int, payId)
      .query(`SELECT lead_id, slip_field, step_no, doc_no, amount FROM payments WHERE id = @id`);
    if (payRes.recordset.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    const pay = payRes.recordset[0];
    const slipField = pay.slip_field as string;
    const paidFlag = PAID_FLAG[slipField] ?? null;

    // Revert (don't delete) so payment_no + step_no + amount stay stable when
    // the slip is re-uploaded + re-confirmed. Clears slip data + confirm meta
    // back to pending.
    await db.request().input("id", sql.Int, payId).query(`
      UPDATE payments SET
        slip_data = NULL, slip_data_2 = NULL, slip_data_3 = NULL, slip_data_4 = NULL, slip_data_5 = NULL,
        slip_mime = NULL, slip_mime_2 = NULL, slip_mime_3 = NULL, slip_mime_4 = NULL, slip_mime_5 = NULL,
        slip_filename = NULL, slip_filename_2 = NULL, slip_filename_3 = NULL, slip_filename_4 = NULL, slip_filename_5 = NULL,
        confirmed_at = NULL,
        confirmed_by = NULL,
        payment_method = NULL,
        cheque_received_at = NULL,
        cheque_received_by = NULL
      WHERE id = @id
    `);

    // Legacy slip_fields also flipped a leads column on confirm — flip it back.
    // Dynamic per-installment slips (order_installment_<i>) have no column.
    if (slipField === "pre_slip_url") {
      // Admin ถอย pre_slip_url confirm → reset entirely back to plain
      // `pre_survey` regardless of where it was (-01, -02, or even survey).
      await db.request().input("lead_id", sql.Int, pay.lead_id)
        .query(`UPDATE leads SET
          pre_slip_url = NULL, payment_confirmed = 0,
          pre_doc_no = NULL, pre_total_price = NULL, pre_package_id = NULL, pre_booked_at = NULL,
          status = CASE
            WHEN status LIKE 'pre_survey%' OR status = 'survey' THEN 'pre_survey'
            ELSE status
          END,
          updated_at = GETDATE()
          WHERE id = @lead_id`);
    } else if (paidFlag) {
      await db.request().input("lead_id", sql.Int, pay.lead_id)
        .query(`UPDATE leads SET ${slipField} = NULL, ${paidFlag} = 0, updated_at = GETDATE() WHERE id = @lead_id`);
    }

    await db.request()
      .input("lead_id", sql.Int, pay.lead_id)
      .input("slip_field", sql.NVarChar(50), slipField)
      .input("step_no", sql.Int, pay.step_no)
      .input("details", sql.NVarChar(sql.MAX), JSON.stringify({ payment_id: payId, doc_no: pay.doc_no, amount: pay.amount }))
      .query(`INSERT INTO payment_logs (lead_id, action, slip_field, step_no, details, user_id)
              VALUES (@lead_id, 'undo_payment', @slip_field, @step_no, @details, 1)`);

    // Re-derive legacy order_before_paid / order_after_paid after undo of an installment.
    if (/^order_installment_\d+$/.test(slipField)) {
      await syncOrderPaidFlags(db, pay.lead_id).catch(e => console.error("syncOrderPaidFlags failed:", e));
    }

    await refreshJourneySafe(db, pay.lead_id);

    await logLeadActivity(db, {
      leadId: pay.lead_id,
      activityType: "payment_undone",
      title: `ยกเลิกการชำระเงิน ${paymentStepLabel(slipField, pay.step_no)} ${fmtBaht(pay.amount)}`,
      note: pay.doc_no || null,
      userId: gate.userId,
    });

    return NextResponse.json({ ok: true, lead_id: pay.lead_id });
  } catch (e) {
    console.error("DELETE /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
