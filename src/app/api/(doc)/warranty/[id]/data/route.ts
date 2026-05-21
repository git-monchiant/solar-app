import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userIdParam = req.nextUrl.searchParams.get("user_id");
    const db = await getDb();

    const leadResult = await db.request()
      .input("id", sql.Int, parseInt(id))
      .query(`
        SELECT l.*, p.name as project_official_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        WHERE l.id = @id
      `);

    if (leadResult.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const lead = fixDates(leadResult.recordset)[0];
    // Project display: prefer project_alias (custom name on lead) → project's
    // free-text fallback (l.project_name) → joined project's official name.
    // Customer-facing docs (warranty cert) should never show the catch-all
    // "โครงการอื่นทั่วไป" if there's a real alias on the lead.
    lead.project_name = (lead.project_alias && String(lead.project_alias).trim())
      || (lead.project_name && String(lead.project_name).trim())
      || lead.project_official_name
      || null;
    delete lead.project_official_name;

    // Signer priority: who actually issued > current viewer > lead owner.
    // For legacy leads with no warranty_issued_by stamp, the first viewer
    // with a user_id param also AUTO-STAMPS lead.warranty_issued_by so the
    // signer sticks across opens — otherwise every viewer would see their
    // own name and the cert identity would drift.
    let signer: { full_name: string; signature_url: string | null } | null = null;
    const viewerId = userIdParam ? parseInt(userIdParam) : null;
    const signerId = lead.warranty_issued_by || viewerId || lead.assigned_user_id;
    if (signerId) {
      const u = await db.request().input("id", sql.Int, signerId)
        .query(`SELECT full_name, signature_url FROM users WHERE id = @id`);
      if (u.recordset.length > 0) signer = u.recordset[0];
    }
    // Auto-stamp: when warranty_issued_by was empty and a viewer is opening
    // the cert, persist the viewer as the issuer of record. Idempotent — once
    // set, the OR-chain above skips this branch.
    if (!lead.warranty_issued_by && viewerId) {
      await db.request()
        .input("id", sql.Int, parseInt(id))
        .input("by", sql.Int, viewerId)
        .query(`UPDATE leads SET warranty_issued_by = @by, updated_at = SYSUTCDATETIME() WHERE id = @id AND warranty_issued_by IS NULL`);
      lead.warranty_issued_by = viewerId;
    }

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

    return NextResponse.json({ lead, package: pkg, signer });
  } catch (error) {
    console.error("GET /api/warranty/[id]/data error:", error);
    return NextResponse.json({ error: "Failed to fetch warranty data" }, { status: 500 });
  }
}
