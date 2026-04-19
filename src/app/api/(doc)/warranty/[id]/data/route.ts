import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();

    const leadResult = await db.request()
      .input("id", sql.Int, parseInt(id))
      .query(`
        SELECT l.*, p.name as project_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        WHERE l.id = @id
      `);

    if (leadResult.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const lead = fixDates(leadResult.recordset)[0];

    // Use the package confirmed at Survey (lead.interested_package_id is overwritten
    // by the survey team's final pick).
    const pkgId = lead.interested_package_id;

    let pkg = null;
    if (pkgId) {
      const pkgResult = await db.request()
        .input("pid", sql.Int, pkgId)
        .query(`SELECT * FROM packages WHERE id = @pid`);
      pkg = pkgResult.recordset[0] || null;
    }

    return NextResponse.json({ lead, package: pkg });
  } catch (error) {
    console.error("GET /api/warranty/[id]/data error:", error);
    return NextResponse.json({ error: "Failed to fetch warranty data" }, { status: 500 });
  }
}
