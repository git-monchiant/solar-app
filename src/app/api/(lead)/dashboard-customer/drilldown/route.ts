import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { getCustomerDrilldown, parseCustomerDashboardFilters } from "@/lib/customer-dashboard-data";

export const runtime = "nodejs";

const ROLES = ["admin", "sales", "solar", "account"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ROLES);
  if (gate.error) return gate.error;
  const dimension = req.nextUrl.searchParams.get("dimension") || "";
  const value = req.nextUrl.searchParams.get("value") || "";
  const scoreRaw = Number(req.nextUrl.searchParams.get("score") || 0);
  const score = Number.isInteger(scoreRaw) && scoreRaw >= 1 && scoreRaw <= 5 ? scoreRaw : null;
  if (!dimension) return NextResponse.json({ error: "dimension is required" }, { status: 400 });
  try {
    const rows = await getCustomerDrilldown(parseCustomerDashboardFilters(req.nextUrl.searchParams), dimension, value, score);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/dashboard-customer/drilldown error:", error);
    return NextResponse.json({ error: "Failed to fetch drill-down" }, { status: 500 });
  }
}
