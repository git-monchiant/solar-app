import { NextRequest, NextResponse } from "next/server";
import { fixDates, getDb } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ["admin", "solar_sup", "sales_sup"]);
  if (gate.error) return gate.error;

  const requestedStage = req.nextUrl.searchParams.get("stage");
  const isAdmin = gate.roles.includes("admin");
  const isSolarSup = gate.roles.includes("solar_sup");
  const isSalesSup = gate.roles.includes("sales_sup");

  let statuses: string[] = [];
  if (requestedStage === "solar_sup") {
    if (!isAdmin && !isSolarSup) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    statuses = ["pending_solar_sup"];
  } else if (requestedStage === "sales_sup") {
    if (!isAdmin && !isSalesSup) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    statuses = ["pending_sales_sup", "pending_approval"];
  } else {
    if (isAdmin || isSolarSup) statuses.push("pending_solar_sup");
    if (isAdmin || isSalesSup) {
      statuses.push("pending_sales_sup", "pending_approval");
    }
  }

  if (!statuses.length) return NextResponse.json([]);

  const db = await getDb();
  const result = await db.request().query(`
    SELECT
      q.id,
      q.doc_no,
      q.option_no,
      q.status,
      q.package_name_snapshot,
      q.contract_total_incl_vat,
      q.outstanding_amount,
      q.submitted_at,
      q.solar_approved_at,
      l.id lead_id,
      l.full_name customer_name,
      submitter.full_name submitted_by_name,
      solar_approver.full_name solar_approved_by_name
    FROM quotations q
    JOIN leads l ON l.id = q.lead_id
    LEFT JOIN users submitter ON submitter.id = q.submitted_by
    LEFT JOIN users solar_approver ON solar_approver.id = q.solar_approved_by
    WHERE q.status IN (${statuses.map((status) => `'${status}'`).join(",")})
    ORDER BY q.submitted_at, q.id
  `);
  return NextResponse.json(fixDates(result.recordset));
}
