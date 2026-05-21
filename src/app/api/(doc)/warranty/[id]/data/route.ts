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

    // Signer priority (first non-null wins):
    //   1. app_settings.warranty_signer_user_id — admin-configured default
    //      wins everything else (the cert is a corporate doc — one designated
    //      signer for the whole company)
    //   2. lead.warranty_issued_by — per-lead explicit issuer (legacy /
    //      pre-config rows)
    //   3. userIdParam — current viewer
    //   4. lead.assigned_user_id — sales owner (last-resort fallback)
    const viewerId = userIdParam ? parseInt(userIdParam) : null;
    const defaultSignerRow = await db.request()
      .query(`SELECT value FROM app_settings WHERE [key] = 'warranty_signer_user_id'`);
    const configSignerId = defaultSignerRow.recordset[0]?.value
      ? parseInt(defaultSignerRow.recordset[0].value) || null
      : null;
    let signer: { full_name: string; signature_url: string | null } | null = null;
    const signerId = configSignerId || lead.warranty_issued_by || viewerId || lead.assigned_user_id;
    if (signerId) {
      const u = await db.request().input("id", sql.Int, signerId)
        .query(`SELECT full_name, signature_url FROM users WHERE id = @id`);
      if (u.recordset.length > 0) signer = u.recordset[0];
    }
    // Auto-stamp legacy leads when we fall through to viewer — but ONLY if
    // no config override exists (otherwise stamping would lock in the wrong
    // person and override the admin default).
    if (!lead.warranty_issued_by && !configSignerId && viewerId) {
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
