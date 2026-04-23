import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// LINE profile registry. Same LINE can be attached to many leads/prospects,
// and that link lives on leads.line_id / prospects.line_id — not here.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT lu.id, lu.line_user_id, lu.display_name, lu.picture_url, lu.created_at, lu.last_message_at,
        (SELECT COUNT(*) FROM leads WHERE line_id = lu.line_user_id) as linked_leads_count,
        (SELECT COUNT(*) FROM prospects WHERE line_id = lu.line_user_id) as linked_prospects_count
      FROM line_users lu
      ORDER BY lu.created_at DESC
    `);
    const linkedLeads = await db.request().query(`
      SELECT line_id, id, full_name, phone, status FROM leads
      WHERE line_id IS NOT NULL
      ORDER BY id ASC
    `);
    const leadsByLine = new Map<string, Array<{ id: number; full_name: string; phone: string | null; status: string }>>();
    for (const row of linkedLeads.recordset) {
      if (!leadsByLine.has(row.line_id)) leadsByLine.set(row.line_id, []);
      leadsByLine.get(row.line_id)!.push({ id: row.id, full_name: row.full_name, phone: row.phone, status: row.status });
    }
    const linkedProspects = await db.request().query(`
      SELECT p.line_id, p.id, p.house_number, p.full_name, p.project_name, p.lead_id
      FROM prospects p
      WHERE p.line_id IS NOT NULL
      ORDER BY p.id ASC
    `);
    const prospectsByLine = new Map<string, Array<{ id: number; house_number: string | null; full_name: string | null; project_name: string | null; lead_id: number | null }>>();
    for (const row of linkedProspects.recordset) {
      if (!prospectsByLine.has(row.line_id)) prospectsByLine.set(row.line_id, []);
      prospectsByLine.get(row.line_id)!.push({ id: row.id, house_number: row.house_number, full_name: row.full_name, project_name: row.project_name, lead_id: row.lead_id });
    }
    const enriched = result.recordset.map((u: { line_user_id: string } & Record<string, unknown>) => ({
      ...u,
      linked_leads: leadsByLine.get(u.line_user_id) || [],
      linked_prospects: prospectsByLine.get(u.line_user_id) || [],
    }));
    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/line-users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
