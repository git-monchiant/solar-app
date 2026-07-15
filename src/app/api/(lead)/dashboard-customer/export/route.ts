import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { parseCustomerDashboardFilters } from "@/lib/customer-dashboard-data";
import { buildCustomerExportWorkbook, getCustomerExportRows } from "@/lib/customer-dashboard-export";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROLES = ["admin", "sales", "solar", "account"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ROLES);
  if (gate.error) return gate.error;

  try {
    const filters = parseCustomerDashboardFilters(req.nextUrl.searchParams);
    const rows = await getCustomerExportRows(filters);
    if (!rows.length) {
      return NextResponse.json({ error: "ไม่พบข้อมูล Customer Info ตาม Filter ที่เลือก" }, { status: 422 });
    }

    const workbook = buildCustomerExportWorkbook(rows);
    const from = filters.from || "all";
    const to = filters.to || "all";
    return new NextResponse(Uint8Array.from(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=customer-info_${from}_${to}.xlsx`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard-customer/export error:", error);
    return NextResponse.json({ error: "สร้างไฟล์ Excel ไม่สำเร็จ" }, { status: 500 });
  }
}
