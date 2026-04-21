import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const genToken = () => crypto.randomBytes(16).toString("hex");

// POST /api/pay-tokens  { lead_id, amount, description? } -> { token, url }
// Reuses the lead's existing token when amount + description haven't changed.
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { lead_id, amount, description, installment } = await req.json();
    const leadId = parseInt(lead_id);
    const amt = parseFloat(amount);
    const desc: string | null = typeof description === "string" && description.length > 0 ? description.slice(0, 200) : null;
    const inst: string | null = typeof installment === "string" && installment.length > 0 ? installment.slice(0, 50) : null;
    if (!leadId || !(amt > 0)) {
      return NextResponse.json({ error: "lead_id and positive amount required" }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT pre_pay_token, pre_pay_amount, pre_pay_description, pre_pay_installment FROM leads WHERE id = @id`);
    if (existing.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const row = existing.recordset[0];
    const currentAmount = row.pre_pay_amount != null ? Number(row.pre_pay_amount) : null;
    const currentDesc = row.pre_pay_description ?? null;
    const currentInst = row.pre_pay_installment ?? null;

    let token: string;
    if (row.pre_pay_token && currentAmount === amt && currentDesc === desc && currentInst === inst) {
      token = row.pre_pay_token;
    } else {
      token = genToken();
      await db.request()
        .input("id", sql.Int, leadId)
        .input("token", sql.NVarChar(64), token)
        .input("amount", sql.Decimal(12, 2), amt)
        .input("description", sql.NVarChar(200), desc)
        .input("installment", sql.NVarChar(50), inst)
        .query(`UPDATE leads SET pre_pay_token = @token, pre_pay_amount = @amount, pre_pay_description = @description, pre_pay_installment = @installment WHERE id = @id`);
    }

    return NextResponse.json({ token, url: `/pay/${token}` });
  } catch (e) {
    console.error("POST /api/pay-tokens error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
