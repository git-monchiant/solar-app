import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { canManageQuotation, getQuotationActor } from "@/lib/quotation";
import { notifyQuotationRole } from "@/lib/quotation-notifications";
import { logLeadActivity } from "@/lib/lead-activity-log";

const COOLDOWN_MINUTES = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });

  const { id } = await params;
  const quotationId = Number(id);
  if (!Number.isInteger(quotationId) || quotationId <= 0) {
    return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const found = await new sql.Request(tx)
      .input("id", sql.Int, quotationId)
      .query(`
        SELECT q.id, q.lead_id, q.doc_no, q.status, q.created_by, q.submitted_by,
          l.full_name customer_name
        FROM dbo.quotations q WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.leads l ON l.id = q.lead_id
        WHERE q.id = @id;
      `);
    const quotation = found.recordset[0];
    if (!quotation) {
      await tx.rollback();
      return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    }

    if (
      !canManageQuotation(actor.roles) &&
      !actor.roles.includes("admin") &&
      quotation.created_by !== gate.userId &&
      quotation.submitted_by !== gate.userId
    ) {
      await tx.rollback();
      return NextResponse.json({ error: "ไม่มีสิทธิ์เตือนผู้อนุมัติ" }, { status: 403 });
    }

    const stage = quotation.status === "pending_solar_sup"
      ? "solar_sup"
      : ["pending_sales_sup", "pending_approval"].includes(quotation.status)
        ? "sales_sup"
        : null;
    if (!stage) {
      await tx.rollback();
      return NextResponse.json({ error: "ใบเสนอราคาไม่ได้อยู่ในขั้นรออนุมัติ" }, { status: 409 });
    }

    const latest = await new sql.Request(tx)
      .input("qid", sql.Int, quotationId)
      .input("stage", sql.NVarChar(30), stage)
      .query(`
        SELECT TOP 1 reminded_at
        FROM dbo.quotation_approval_reminders WITH (UPDLOCK, HOLDLOCK)
        WHERE quotation_id = @qid AND approval_stage = @stage
        ORDER BY reminded_at DESC, id DESC;
      `);
    const latestAt = latest.recordset[0]?.reminded_at as Date | undefined;
    if (latestAt) {
      const retryAt = new Date(latestAt.getTime() + COOLDOWN_MINUTES * 60_000);
      if (retryAt.getTime() > Date.now()) {
        await tx.rollback();
        return NextResponse.json(
          { error: "เพิ่งส่งการแจ้งเตือนไป กรุณารอให้ครบ 1 ชั่วโมง", retry_at: retryAt.toISOString() },
          { status: 429 },
        );
      }
    }

    await new sql.Request(tx)
      .input("qid", sql.Int, quotationId)
      .input("stage", sql.NVarChar(30), stage)
      .input("uid", sql.Int, gate.userId)
      .query(`
        INSERT dbo.quotation_approval_reminders(quotation_id, approval_stage, reminded_by)
        VALUES(@qid, @stage, @uid);
      `);

    const targetLabel = stage === "solar_sup" ? "Solar Manager" : "Sale Manager";
    await notifyQuotationRole(tx, stage, {
      quotationId,
      leadId: quotation.lead_id,
      type: "approval_reminder",
      stage,
      title: `เตือนอนุมัติใบเสนอราคา ${quotation.doc_no}`,
      message: `${actor.full_name} ขอให้ ${targetLabel} ตรวจสอบใบเสนอราคาของ ${quotation.customer_name}`,
      createdBy: gate.userId,
    });
    await logLeadActivity(tx, {
      leadId: quotation.lead_id,
      activityType: "quotation",
      title: `เตือน ${targetLabel} อนุมัติใบเสนอราคา ${quotation.doc_no}`,
      userId: gate.userId,
    });

    await tx.commit();
    return NextResponse.json({ ok: true, reminded_at: new Date().toISOString(), cooldown_minutes: COOLDOWN_MINUTES });
  } catch (error) {
    try { await tx.rollback(); } catch {}
    console.error("quotation reminder", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ส่งการแจ้งเตือนไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
