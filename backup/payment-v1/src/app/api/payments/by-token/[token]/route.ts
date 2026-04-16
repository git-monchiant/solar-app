import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token || token.length < 10) return NextResponse.json({ error: "invalid token" }, { status: 404 });

    const db = await getDb();
    const result = await db.request().input("token", sql.NVarChar(64), token)
      .query(`
        SELECT pt.id, pt.lead_id, pt.reference_order, pt.qr_image_base64, pt.amount, pt.status, pt.paid_at, pt.expires_at,
               l.full_name, l.phone, p.name as project_name, l.installation_address
        FROM payment_transactions pt
        LEFT JOIN leads l ON l.id = pt.lead_id
        LEFT JOIN projects p ON p.id = l.project_id
        WHERE pt.access_token = @token
      `);
    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const r = result.recordset[0];
    return NextResponse.json({
      id: r.id,
      lead_id: r.lead_id,
      reference_order: r.reference_order,
      qr_image_base64: r.qr_image_base64,
      amount: r.amount,
      status: r.status,
      paid_at: r.paid_at,
      expires_at: r.expires_at,
      customer: {
        full_name: r.full_name,
        phone: r.phone,
        project_name: r.project_name,
        installation_address: r.installation_address,
      },
    });
  } catch (error) {
    console.error("GET /api/payments/by-token error:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
