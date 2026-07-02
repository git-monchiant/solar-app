import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

// Data feed for the post-install inspection document (เอกสารตรวจสอบงานติดตั้ง).
// Joins:
//   leads               — customer + project + install_checklist_doc_no
//   install_checklists  — inspection_date + JSON specs/checks/tests + notes + sigs
//   users               — signer name (whoever submitted the checklist, or viewer)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const userIdParam = req.nextUrl.searchParams.get("user_id");
    const db = await getDb();

    const leadRes = await db.request().input("id", sql.Int, leadId).query(`
      SELECT l.id, l.full_name, l.phone, l.project_name, l.project_alias,
             l.installation_address, l.install_checklist_doc_no,
             l.install_completed_at, l.install_completed_by,
             l.install_customer_signature_url,
             l.install_photos, l.install_photos_extra,
             l.assigned_user_id,
             p.name AS project_official_name,
             u.full_name AS assigned_name
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      WHERE l.id = @id
    `);
    if (leadRes.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const lead = fixDates(leadRes.recordset)[0];
    lead.project_name = (lead.project_alias && String(lead.project_alias).trim())
      || (lead.project_name && String(lead.project_name).trim())
      || lead.project_official_name
      || null;
    delete lead.project_official_name;

    const chkRes = await db.request().input("id", sql.Int, leadId).query(`
      SELECT inspection_date, system_specs, visual_checks, function_tests,
             notes, inspector_signature_url, customer_signature_url, submitted_at,
             updated_by_id
      FROM install_checklists WHERE lead_id = @id
    `);
    const checklist = chkRes.recordset[0] || null;

    // Signer priority — the staff member who actually signed off the work
    // owns the signature on the doc:
    //   1. install_completed_by   (clicked "ยืนยันส่งมอบงาน")
    //   2. checklist.updated_by_id (filled the inspection form)
    //   3. lead.assigned_user_id  (lead owner — fallback)
    //   4. ?user_id query param   (current viewer — last-resort fallback)
    let signer: { full_name: string; signature_url: string | null } | null = null;
    const signerId = lead.install_completed_by
      || checklist?.updated_by_id
      || lead.assigned_user_id
      || (userIdParam ? parseInt(userIdParam) : null);
    if (signerId) {
      const u = await db.request().input("id", sql.Int, signerId)
        .query(`SELECT full_name, signature_url FROM users WHERE id = @id`);
      if (u.recordset.length > 0) signer = u.recordset[0];
    }

    return NextResponse.json({
      lead,
      checklist: checklist ? fixDates([checklist])[0] : null,
      signer,
    });
  } catch (e) {
    console.error("install-doc data error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
