import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ["admin", "solar_sup", "sales_sup"]);
  if (gate.error) return gate.error;

  const requestedStage = req.nextUrl.searchParams.get("stage");
  const isAdmin = gate.roles.includes("admin");
  const canSolar = isAdmin || gate.roles.includes("solar_sup");
  const canSales = isAdmin || gate.roles.includes("sales_sup");
  let statuses: string[] = [];

  if (requestedStage === "solar_sup") {
    if (!canSolar) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    statuses = ["pending_solar_sup"];
  } else if (requestedStage === "sales_sup") {
    if (!canSales) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    statuses = ["pending_sales_sup", "pending_approval"];
  } else {
    if (canSolar) statuses.push("pending_solar_sup");
    if (canSales) statuses.push("pending_sales_sup", "pending_approval");
  }

  if (!statuses.length) return NextResponse.json({ count: 0 });
  const db = await getDb();
  const request = db.request();
  const names = statuses.map((status, index) => {
    const name = `status${index}`;
    request.input(name, sql.NVarChar(30), status);
    return `@${name}`;
  });
  const result = await request.query(`
    SELECT COUNT_BIG(*) [count]
    FROM dbo.quotations
    WHERE status IN (${names.join(",")});
  `);
  return NextResponse.json({ count: Number(result.recordset[0]?.count || 0) });
}
