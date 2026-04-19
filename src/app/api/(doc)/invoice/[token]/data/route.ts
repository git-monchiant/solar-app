import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

// Data for the unified payment-request document (ใบแจ้งโอนเงิน).
// Looked up via the lead's pre_pay_token so the URL never exposes lead_id or amount.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 10) return NextResponse.json({ error: "invalid token" }, { status: 404 });
  try {
    const db = await getDb();
    const r = await db.request().input("token", sql.NVarChar(64), token).query(`
      SELECT l.id, l.full_name, l.phone, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.install_date, l.install_completed_at,
             l.interested_package_ids, l.interested_package_id,
             l.contact_date, l.created_at, l.pre_pay_amount, l.pre_pay_description, l.pre_pay_installment, l.status,
             pr.name as project_name
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE l.pre_pay_token = @token
    `);
    if (r.recordset.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    const l = r.recordset[0];

    // Pre-survey (status=register): show all interested packages. Later steps: show the chosen one.
    const isPreSurvey = l.status === "register";
    const pkgIds = isPreSurvey
      ? (l.interested_package_ids ? l.interested_package_ids.split(",").map(Number).filter(Boolean) : (l.interested_package_id ? [l.interested_package_id] : []))
      : (l.interested_package_id ? [l.interested_package_id] : []);

    let packages: { id: number; name: string; kwp: number; price: number }[] = [];
    if (pkgIds.length > 0) {
      const pkgResult = await db.request().query(
        `SELECT id, name, kwp, price FROM packages WHERE id IN (${pkgIds.join(",")}) ORDER BY kwp`
      );
      packages = pkgResult.recordset;
    }

    const amount = l.pre_pay_amount != null ? Number(l.pre_pay_amount) : 0;

    return NextResponse.json({
      ...fixDates([l])[0],
      amount,
      description: l.pre_pay_description || "",
      installment: l.pre_pay_installment || "",
      packages,
      is_pre_survey: isPreSurvey,
      reference_no: `INV-${String(l.id).padStart(5, "0")}-${new Date().getFullYear()}`,
    });
  } catch (error) {
    console.error("Invoice data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
