import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userIdParam = req.nextUrl.searchParams.get("user_id"); // fallback (current viewer)
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

    // Signer resolution order: who closed the Survey step → lead owner → ?user_id viewer.
    // Server-side lookup so the PDF is deterministic without frontend race conditions.
    let signer: { full_name: string; signature_url: string | null } | null = null;
    const lr = leadResult.recordset[0];
    const signerId = lr?.survey_completed_by || lr?.assigned_user_id || (userIdParam ? parseInt(userIdParam) : null);
    if (signerId) {
      const u = await db.request().input("id", sql.Int, signerId)
        .query(`SELECT full_name, signature_url FROM users WHERE id = @id`);
      if (u.recordset.length > 0) signer = u.recordset[0];
    }

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

    return NextResponse.json({ lead, packages, signer });
  } catch (error) {
    console.error("GET /api/survey/[id]/data error:", error);
    return NextResponse.json({ error: "Failed to fetch survey data" }, { status: 500 });
  }
}
