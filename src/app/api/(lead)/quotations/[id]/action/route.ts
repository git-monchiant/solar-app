import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getQuotationActor, nextQuotationDocNo } from "@/lib/quotation";
import { logLeadActivity } from "@/lib/lead-activity-log";
import {
  buildQuotationDocumentSnapshot,
  validateQuotationDocument,
} from "@/lib/quotation-document";

const SOLAR_PENDING = "pending_solar_sup";
const SALES_PENDING = "pending_sales_sup";
const LEGACY_PENDING = "pending_approval";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const actor = await getQuotationActor(gate.userId);
  if (!actor) {
    return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  }

  const { id } = await params;
  const quotationId = Number(id);
  const body = await req.json();
  const action = String(body.action || "");
  const note = String(body.note || "").trim();
  const db = await getDb();
  const tx = new sql.Transaction(db);

  try {
    await tx.begin();
    const found = await new sql.Request(tx)
      .input("id", sql.Int, quotationId)
      .query(`
        SELECT q.*, l.assigned_user_id
        FROM quotations q
        JOIN leads l ON l.id = q.lead_id
        WHERE q.id = @id
      `);
    const quotation = found.recordset[0];
    if (!quotation) {
      await tx.rollback();
      return NextResponse.json(
        { error: "ไม่พบใบเสนอราคา" },
        { status: 404 },
      );
    }

    const isAdmin = actor.roles.includes("admin");
    const isLeadOwner = quotation.assigned_user_id === gate.userId;
    const canActAsSolarSup =
      isAdmin || actor.roles.includes("solar_sup");
    const canActAsSalesSup =
      isAdmin || actor.roles.includes("sales_sup");

    let next = "";
    let eventAction = action;
    let activityTitle = "";
    let createdRevisionId: number | null = null;

    if (action === "revise") {
      if (quotation.status !== "approved") {
        await tx.rollback();
        return NextResponse.json(
          { error: "สร้าง Revision ได้เฉพาะใบที่อนุมัติแล้ว" },
          { status: 409 },
        );
      }
      if (!isAdmin && !isLeadOwner) {
        await tx.rollback();
        return NextResponse.json(
          { error: "สร้าง Revision ได้เฉพาะผู้รับผิดชอบ Lead หรือ Admin" },
          { status: 403 },
        );
      }

      const latest = await new sql.Request(tx)
        .input("lead_id", sql.Int, quotation.lead_id)
        .input("option", sql.Int, quotation.option_no)
        .query(`
          SELECT MAX(revision_no) revision_no
          FROM quotations WITH (UPDLOCK, HOLDLOCK)
          WHERE lead_id = @lead_id AND option_no = @option
        `);
      if (
        Number(latest.recordset[0]?.revision_no) !==
        Number(quotation.revision_no)
      ) {
        await tx.rollback();
        return NextResponse.json(
          { error: "มี Revision ใหม่กว่านี้แล้ว" },
          { status: 409 },
        );
      }

      const newDocNo = await nextQuotationDocNo(tx);
      const inserted = await new sql.Request(tx)
        .input("id", sql.Int, quotationId)
        .input("doc", sql.NVarChar(30), newDocNo)
        .input("uid", sql.Int, gate.userId)
        .query(`
          INSERT quotations(
            lead_id, option_no, doc_no, revision_no, status, package_id,
            package_name_snapshot, package_price_snapshot, issue_date,
            valid_days, subtotal_incl_vat, discount_label, discount_type,
            discount_value, discount_amount, discount_reason,
            contract_total_incl_vat, deposit_paid_amount, outstanding_amount,
            vat_rate, amount_before_vat, vat_amount, payment_template_id,
            payment_terms_json, terms_text, note, document_inputs_json,
            created_by, updated_by
          )
          OUTPUT INSERTED.id
          SELECT
            lead_id, option_no, @doc, revision_no + 1, 'draft', package_id,
            package_name_snapshot, package_price_snapshot, CAST(GETDATE() AS DATE),
            valid_days, subtotal_incl_vat, discount_label, discount_type,
            discount_value, discount_amount, discount_reason,
            contract_total_incl_vat, deposit_paid_amount, outstanding_amount,
            vat_rate, amount_before_vat, vat_amount, payment_template_id,
            payment_terms_json, terms_text, note, document_inputs_json,
            @uid, @uid
          FROM quotations WHERE id = @id
        `);
      createdRevisionId = inserted.recordset[0].id;
      await new sql.Request(tx)
        .input("old", sql.Int, quotationId)
        .input("new", sql.Int, createdRevisionId)
        .query(`
          INSERT quotation_items(
            quotation_id, source_type, package_item_id, item_name_snapshot,
            quantity, unit, unit_price, line_total, sort_order
          )
          SELECT
            @new, source_type, package_item_id, item_name_snapshot,
            quantity, unit, unit_price, line_total, sort_order
          FROM quotation_items WHERE quotation_id = @old
        `);
      next = "draft";
      activityTitle = `สร้าง Revision ใหม่จากใบเสนอราคา ${quotation.doc_no}`;
    } else if (action === "submit") {
      if (!["draft", "changes_required"].includes(quotation.status)) {
        await tx.rollback();
        return NextResponse.json(
          { error: "สถานะไม่สามารถส่งอนุมัติได้" },
          { status: 409 },
        );
      }
      if (!isAdmin && !isLeadOwner) {
        await tx.rollback();
        return NextResponse.json(
          { error: "ส่งได้เฉพาะผู้รับผิดชอบ Lead" },
          { status: 403 },
        );
      }

      const snapshot = await buildQuotationDocumentSnapshot(quotationId, tx);
      if (!snapshot) {
        await tx.rollback();
        return NextResponse.json(
          { error: "สร้างชุดข้อมูลเอกสารไม่สำเร็จ" },
          { status: 500 },
        );
      }
      const validationErrors = validateQuotationDocument(snapshot);
      if (validationErrors.length) {
        await tx.rollback();
        return NextResponse.json(
          {
            error: `เอกสารยังไม่พร้อมส่งอนุมัติ: ${validationErrors.join(" · ")}`,
          },
          { status: 400 },
        );
      }

      next = SOLAR_PENDING;
      await new sql.Request(tx)
        .input("id", sql.Int, quotationId)
        .input("uid", sql.Int, gate.userId)
        .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
        .input(
          "financial",
          sql.NVarChar(sql.MAX),
          JSON.stringify(snapshot.financial),
        )
        .query(`
          UPDATE quotations SET
            status = 'pending_solar_sup',
            submitted_by = @uid,
            submitted_at = GETDATE(),
            document_snapshot_json = @snapshot,
            financial_snapshot_json = @financial,
            document_snapshot_at = GETDATE(),
            solar_approved_by = NULL,
            solar_approved_at = NULL,
            solar_approval_note = NULL,
            approved_by = NULL,
            approved_at = NULL,
            approval_note = NULL,
            approval_certified_by = NULL,
            approval_certified_at = NULL,
            approver_name_snapshot = NULL,
            approver_title_snapshot = NULL,
            approver_signature_url_snapshot = NULL,
            approver_signature_data_snapshot = NULL,
            approver_signature_mime_snapshot = NULL,
            updated_by = @uid,
            updated_at = GETDATE()
          WHERE id = @id
        `);
      activityTitle = `ส่งใบเสนอราคา ${quotation.doc_no} ให้ Solar Sup อนุมัติ`;
    } else if (action === "approve") {
      if (body.certify !== true) {
        await tx.rollback();
        return NextResponse.json(
          { error: "กรุณายืนยันการตรวจสอบเอกสารก่อนอนุมัติ" },
          { status: 400 },
        );
      }
      if (!quotation.document_snapshot_json || !quotation.financial_snapshot_json) {
        await tx.rollback();
        return NextResponse.json(
          { error: "ไม่พบ Snapshot เอกสาร กรุณาส่งกลับและส่งอนุมัติใหม่" },
          { status: 409 },
        );
      }

      if (quotation.status === SOLAR_PENDING) {
        if (!canActAsSolarSup) {
          await tx.rollback();
          return NextResponse.json(
            { error: "ขั้นนี้อนุมัติได้เฉพาะ Solar Sup หรือ Admin" },
            { status: 403 },
          );
        }
        next = SALES_PENDING;
        eventAction = "approve_solar";
        await new sql.Request(tx)
          .input("id", sql.Int, quotationId)
          .input("uid", sql.Int, gate.userId)
          .input("note", sql.NVarChar(1000), note || null)
          .query(`
            UPDATE quotations SET
              status = 'pending_sales_sup',
              solar_approved_by = @uid,
              solar_approved_at = GETDATE(),
              solar_approval_note = @note,
              approval_note = NULL,
              updated_by = @uid,
              updated_at = GETDATE()
            WHERE id = @id
          `);
        activityTitle = `Solar Sup อนุมัติใบเสนอราคา ${quotation.doc_no} · ส่งต่อ Sale Sup`;
      } else if (
        quotation.status === SALES_PENDING ||
        quotation.status === LEGACY_PENDING
      ) {
        if (!canActAsSalesSup) {
          await tx.rollback();
          return NextResponse.json(
            { error: "ขั้นนี้อนุมัติได้เฉพาะ Sale Sup หรือ Admin" },
            { status: 403 },
          );
        }
        if (!actor.signature_data) {
          await tx.rollback();
          return NextResponse.json(
            { error: "กรุณาบันทึกภาพลายเซ็นใน Profile ก่อนอนุมัติ" },
            { status: 400 },
          );
        }
        next = "approved";
        eventAction = "approve_sales";
        await new sql.Request(tx)
          .input("id", sql.Int, quotationId)
          .input("uid", sql.Int, gate.userId)
          .input("name", sql.NVarChar(150), actor.full_name)
          .input(
            "title",
            sql.NVarChar(100),
            actor.job_title || "Sale Supervisor",
          )
          .input("url", sql.NVarChar(500), actor.signature_url || null)
          .input("data", sql.VarBinary(sql.MAX), actor.signature_data)
          .input(
            "mime",
            sql.NVarChar(100),
            actor.signature_mime || "image/png",
          )
          .input("note", sql.NVarChar(1000), note || null)
          .query(`
            UPDATE quotations SET
              status = 'approved',
              approved_by = @uid,
              approved_at = GETDATE(),
              approval_certified_by = @uid,
              approval_certified_at = GETDATE(),
              approver_name_snapshot = @name,
              approver_title_snapshot = @title,
              approver_signature_url_snapshot = @url,
              approver_signature_data_snapshot = @data,
              approver_signature_mime_snapshot = @mime,
              approval_note = @note,
              updated_by = @uid,
              updated_at = GETDATE()
            WHERE id = @id
          `);
        activityTitle = `Sale Sup อนุมัติใบเสนอราคา ${quotation.doc_no} ครบทุกขั้น`;
      } else {
        await tx.rollback();
        return NextResponse.json(
          { error: "ใบเสนอราคาไม่ได้อยู่ในขั้นที่รออนุมัติ" },
          { status: 409 },
        );
      }
    } else if (action === "changes_required") {
      if (!note) {
        await tx.rollback();
        return NextResponse.json(
          { error: "กรุณาระบุเหตุผลที่ส่งกลับ" },
          { status: 400 },
        );
      }

      let reviewer = "";
      if (quotation.status === SOLAR_PENDING) {
        if (!canActAsSolarSup) {
          await tx.rollback();
          return NextResponse.json(
            { error: "ขั้นนี้ส่งกลับได้เฉพาะ Solar Sup หรือ Admin" },
            { status: 403 },
          );
        }
        reviewer = "Solar Sup";
        eventAction = "changes_required_solar";
      } else if (
        quotation.status === SALES_PENDING ||
        quotation.status === LEGACY_PENDING
      ) {
        if (!canActAsSalesSup) {
          await tx.rollback();
          return NextResponse.json(
            { error: "ขั้นนี้ส่งกลับได้เฉพาะ Sale Sup หรือ Admin" },
            { status: 403 },
          );
        }
        reviewer = "Sale Sup";
        eventAction = "changes_required_sales";
      } else {
        await tx.rollback();
        return NextResponse.json(
          { error: "ใบเสนอราคาไม่ได้อยู่ในขั้นที่ส่งกลับได้" },
          { status: 409 },
        );
      }

      next = "changes_required";
      await new sql.Request(tx)
        .input("id", sql.Int, quotationId)
        .input("uid", sql.Int, gate.userId)
        .input("note", sql.NVarChar(1000), note)
        .query(`
          UPDATE quotations SET
            status = 'changes_required',
            approval_note = @note,
            updated_by = @uid,
            updated_at = GETDATE()
          WHERE id = @id
        `);
      activityTitle = `${reviewer} ส่งใบเสนอราคา ${quotation.doc_no} กลับให้ Sale แก้ไข`;
    } else if (action === "mark_sent") {
      if (quotation.status !== "approved") {
        await tx.rollback();
        return NextResponse.json(
          { error: "ส่งลูกค้าได้เฉพาะใบที่อนุมัติแล้ว" },
          { status: 409 },
        );
      }
      if (!isAdmin && !isLeadOwner) {
        await tx.rollback();
        return NextResponse.json(
          { error: "ส่งได้เฉพาะ Sales เจ้าของ Lead หรือ Admin" },
          { status: 403 },
        );
      }

      next = "approved";
      await new sql.Request(tx)
        .input("id", sql.Int, quotationId)
        .input("uid", sql.Int, gate.userId)
        .query(`
          UPDATE quotations SET
            sent_to_customer_by = @uid,
            sent_to_customer_at = GETDATE(),
            updated_by = @uid,
            updated_at = GETDATE()
          WHERE id = @id
        `);
      const approved = await new sql.Request(tx)
        .input("lead_id", sql.Int, quotation.lead_id)
        .query(`
          SELECT id, doc_no, contract_total_incl_vat
          FROM quotations
          WHERE lead_id = @lead_id AND status = 'approved'
          ORDER BY option_no
        `);
      const approvedRows = approved.recordset as Array<{
        id: number;
        doc_no: string;
        contract_total_incl_vat: number;
      }>;
      const selectedIdx = approvedRows.findIndex(
        (row) => row.id === quotationId,
      );
      if (selectedIdx < 0) {
        await tx.rollback();
        return NextResponse.json(
          { error: "ไม่พบใบเสนอราคาที่เลือกในรายการที่อนุมัติแล้ว" },
          { status: 409 },
        );
      }
      const options = approvedRows.map(
        (row: {
          id: number;
          doc_no: string;
          contract_total_incl_vat: number;
        }) => ({
          url: `/api/quotation-pdf/${row.id}/${encodeURIComponent(`${row.doc_no}.pdf`)}?user_id=${gate.userId}`,
          doc_no: row.doc_no,
          amount: Number(row.contract_total_incl_vat),
        }),
      );
      const selected = options[selectedIdx];
      await new sql.Request(tx)
        .input("lead_id", sql.Int, quotation.lead_id)
        .input("files", sql.NVarChar(sql.MAX), JSON.stringify(options))
        .input("accepted", sql.Int, selectedIdx)
        .input("amount", sql.Decimal(12, 2), selected.amount)
        .input("doc", sql.NVarChar(30), selected.doc_no)
        .input("by", sql.NVarChar(200), actor.full_name)
        .input("uid", sql.Int, gate.userId)
        .query(`
          UPDATE leads SET
            status = 'order',
            quotation_files = @files,
            quotation_accepted_idx = @accepted,
            quotation_amount = @amount,
            quotation_doc_no = @doc,
            order_total = @amount,
            quotation_by = @by,
            quotation_sent_date = CAST(GETDATE() AS DATE),
            quote_sent_by = @uid,
            updated_at = GETDATE()
          WHERE id = @lead_id
        `);
      activityTitle = `ส่งใบเสนอราคา ${quotation.doc_no} ให้ลูกค้า`;
    } else {
      await tx.rollback();
      return NextResponse.json(
        { error: "action ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    await new sql.Request(tx)
      .input("qid", sql.Int, quotationId)
      .input("action", sql.NVarChar(30), eventAction)
      .input("from", sql.NVarChar(30), quotation.status)
      .input("to", sql.NVarChar(30), next)
      .input("note", sql.NVarChar(1000), note || null)
      .input("uid", sql.Int, gate.userId)
      .query(`
        INSERT quotation_approval_events(
          quotation_id, action, from_status, to_status, note, acted_by
        )
        VALUES(@qid, @action, @from, @to, @note, @uid)
      `);

    await logLeadActivity(tx, {
      leadId: quotation.lead_id,
      activityType: "quotation",
      title: activityTitle || eventAction,
      note: note || null,
      userId: gate.userId,
    });

    await tx.commit();
    return NextResponse.json({
      ok: true,
      status: next,
      quotation_id: createdRevisionId || quotationId,
    });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    console.error("quotation action", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
