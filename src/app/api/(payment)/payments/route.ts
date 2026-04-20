import { NextRequest, NextResponse } from "next/server";
import { readdir, unlink } from "fs/promises";
import path from "path";
import { getDb, sql } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SLIPS = 5;

// Maps slip_field (column on leads) → paid flag (column on leads).
const PAID_FLAG: Record<string, string> = {
  pre_slip_url: "payment_confirmed",
  order_before_slip: "order_before_paid",
  order_after_slip: "order_after_paid",
};

// Remove every temp slip file on disk that belongs to this lead+step. After a
// confirmed payment the canonical copies live in payments.slip_data/slip_data_2..5,
// so any `lead<id>_slip_step<n>_<ts>.<ext>` leftovers in public/uploads/ are orphans.
async function cleanupTempSlips(leadId: number, stepNo: number) {
  const dir = path.join(process.cwd(), "public", "uploads");
  const prefix = `lead${leadId}_slip_step${stepNo}_`;
  try {
    const files = await readdir(dir);
    await Promise.all(
      files
        .filter((f) => f.startsWith(prefix))
        .map((f) => unlink(path.join(dir, f)).catch(() => {})),
    );
  } catch {
    // dir missing or unreadable — nothing to clean
  }
}

// POST /api/payments
// Body: { lead_id, step_no, slip_field, doc_no?, amount, description?, confirmed_by? }
// Atomic confirm:
//   1. SELECT all slip_files rows for (lead_id, slip_field), ordered by id — up to MAX_SLIPS
//   2. INSERT payments row populating slot 1..N columns (slip_data_<N>, etc.)
//   3. PATCH lead: [slip_field] = /api/payments/:id, [paid_flag] = 1
//   4. DELETE the staging slip_files rows
//   5. Clean temp slip files left on disk
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    const leadId = parseInt(String(body.lead_id || 0));
    const stepNo = parseInt(String(body.step_no ?? -1));
    const slipField = String(body.slip_field || "");
    const amount = parseFloat(String(body.amount || 0));
    if (!leadId || stepNo < 0 || !slipField || !amount) {
      return NextResponse.json({ error: "lead_id, step_no, slip_field, amount required" }, { status: 400 });
    }
    const paidFlag = PAID_FLAG[slipField];
    if (!paidFlag) {
      return NextResponse.json({ error: `Unknown slip_field: ${slipField}` }, { status: 400 });
    }
    const pool = await getDb();

    // Atomic commit: SELECT staging → INSERT payment → UPDATE lead → DELETE staging.
    // Any failure rolls back so the lead flag never flips while staging lingers.
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let paymentId: number;
    let slipCount: number;
    try {
      const slipRes = await new sql.Request(tx)
        .input("lead_id", sql.Int, leadId)
        .input("slip_field", sql.NVarChar(50), slipField)
        .query(`
          SELECT TOP (${MAX_SLIPS}) id, data, mime, filename FROM slip_files
          WHERE lead_id = @lead_id AND slip_field = @slip_field
          ORDER BY id ASC
        `);
      if (slipRes.recordset.length === 0) {
        await tx.rollback();
        return NextResponse.json({ error: "Slip not found — upload and verify first" }, { status: 400 });
      }
      slipCount = slipRes.recordset.length;

      const insertReq = new sql.Request(tx)
        .input("lead_id", sql.Int, leadId)
        .input("step_no", sql.Int, stepNo)
        .input("slip_field", sql.NVarChar(50), slipField)
        .input("doc_no", sql.NVarChar(50), body.doc_no ?? null)
        .input("amount", sql.Decimal(12, 2), amount)
        .input("description", sql.NVarChar(200), body.description ?? null)
        .input("confirmed_by", sql.NVarChar(100), body.confirmed_by ?? null);

      const slotCols: string[] = ["slip_data", "slip_mime", "slip_filename"];
      const slotParams: string[] = ["@slip_data", "@slip_mime", "@slip_filename"];
      for (let i = 0; i < MAX_SLIPS; i++) {
        const slip = slipRes.recordset[i] ?? null;
        const suffix = i === 0 ? "" : `_${i + 1}`;
        insertReq
          .input(`slip_data${suffix}`, sql.VarBinary(sql.MAX), slip?.data ?? null)
          .input(`slip_mime${suffix}`, sql.NVarChar(50), slip?.mime ?? null)
          .input(`slip_filename${suffix}`, sql.NVarChar(200), slip?.filename ?? null);
        if (i > 0) {
          slotCols.push(`slip_data${suffix}`, `slip_mime${suffix}`, `slip_filename${suffix}`);
          slotParams.push(`@slip_data${suffix}`, `@slip_mime${suffix}`, `@slip_filename${suffix}`);
        }
      }

      const insertRes = await insertReq.query(`
        INSERT INTO payments (lead_id, step_no, slip_field, doc_no, amount, description, ${slotCols.join(", ")}, confirmed_by)
        OUTPUT INSERTED.id
        VALUES (@lead_id, @step_no, @slip_field, @doc_no, @amount, @description, ${slotParams.join(", ")}, @confirmed_by)
      `);
      paymentId = insertRes.recordset[0].id;
      const paymentUrl = `/api/payments/${paymentId}`;

      await new sql.Request(tx)
        .input("lead_id", sql.Int, leadId)
        .input("url", sql.NVarChar(200), paymentUrl)
        .query(`UPDATE leads SET ${slipField} = @url, ${paidFlag} = 1, updated_at = GETDATE() WHERE id = @lead_id`);

      await new sql.Request(tx)
        .input("lead_id", sql.Int, leadId)
        .input("slip_field", sql.NVarChar(50), slipField)
        .query(`DELETE FROM slip_files WHERE lead_id = @lead_id AND slip_field = @slip_field`);

      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }

    // Filesystem cleanup outside the DB transaction — best-effort, orphans on
    // failure are harmless (just disk bytes).
    await cleanupTempSlips(leadId, stepNo);

    return NextResponse.json({ id: paymentId, url: `/api/payments/${paymentId}`, slip_count: slipCount });
  } catch (e) {
    console.error("POST /api/payments error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// GET /api/payments?lead_id=X[&step_no=Y]
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const leadId = parseInt(searchParams.get("lead_id") || "0");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const stepNo = searchParams.get("step_no");
    const db = await getDb();
    const request = db.request().input("lead_id", sql.Int, leadId);
    let q = `SELECT id, lead_id, step_no, slip_field, doc_no, amount, description, slip_mime, slip_filename, confirmed_by, confirmed_at
             FROM payments WHERE lead_id = @lead_id`;
    if (stepNo !== null) {
      request.input("step_no", sql.Int, parseInt(stepNo));
      q += ` AND step_no = @step_no`;
    }
    q += ` ORDER BY id DESC`;
    const r = await request.query(q);
    return NextResponse.json(r.recordset);
  } catch (e) {
    console.error("GET /api/payments error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/payments?lead_id=X&step_no=Y
// Rollback: remove all payment rows for (lead_id, step_no). Also clears the lead's
// slip URL + paid flag so data is consistent after rolling back a step.
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const leadId = parseInt(searchParams.get("lead_id") || "0");
    const stepNo = searchParams.get("step_no");
    if (!leadId || stepNo === null) {
      return NextResponse.json({ error: "lead_id and step_no required" }, { status: 400 });
    }
    const db = await getDb();
    const step = parseInt(stepNo);
    const rows = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("step_no", sql.Int, step)
      .query(`SELECT DISTINCT slip_field FROM payments WHERE lead_id = @lead_id AND step_no = @step_no`);

    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("step_no", sql.Int, step)
      .query(`DELETE FROM payments WHERE lead_id = @lead_id AND step_no = @step_no`);

    for (const r of rows.recordset) {
      const slipField: string = r.slip_field;
      const paidFlag = PAID_FLAG[slipField];
      if (!paidFlag) continue;
      await db.request().input("lead_id", sql.Int, leadId).query(
        `UPDATE leads SET ${slipField} = NULL, ${paidFlag} = 0, updated_at = GETDATE() WHERE id = @lead_id`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/payments error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
