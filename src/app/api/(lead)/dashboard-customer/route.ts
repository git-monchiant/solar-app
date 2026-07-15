import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { getCustomerDashboard, parseCustomerDashboardFilters } from "@/lib/customer-dashboard-data";

export const runtime = "nodejs";

const ROLES = ["admin", "sales", "solar", "account"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ROLES);
  if (gate.error) return gate.error;
  try {
    const data = await getCustomerDashboard(parseCustomerDashboardFilters(req.nextUrl.searchParams));
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/dashboard-customer error:", error);
    return NextResponse.json({ error: "Failed to fetch customer dashboard" }, { status: 500 });
  }
}
