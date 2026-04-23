import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();

    const leadResult = await db.request()
      .input("id", sql.Int, parseInt(id))
      .query(`
        SELECT l.*, p.name as project_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.id = @id
      `);

    if (leadResult.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const lead = fixDates(leadResult.recordset)[0];

    const pkgIds = String(lead.interested_package_ids || lead.interested_package_id || "")
      .split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    let packages: Record<string, unknown>[] = [];
    if (pkgIds.length) {
      const pkgResult = await db.request().query(
        `SELECT * FROM packages WHERE id IN (${pkgIds.join(",")})`
      );
      packages = pkgResult.recordset;
    }

    return NextResponse.json({ lead, packages });
  } catch (error) {
    console.error("GET /api/survey/[id]/data error:", error);
    return NextResponse.json({ error: "Failed to fetch survey data" }, { status: 500 });
  }
}
