import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const hasProspects = req.nextUrl.searchParams.get("has_prospects") === "1";
    const db = await getDb();
    const query = hasProspects
      ? `SELECT p.id, p.name, p.assignee,
           (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id) AS prospect_count,
           (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id AND pr.interest = 'interested') AS interested_count,
           (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id AND pr.interest = 'not_interested') AS not_interested_count,
           (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
              AND pr.interest IS NULL AND pr.visited_at IS NULL
              AND (pr.note IS NULL OR pr.note = N'')) AS pending_count,
           (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id AND pr.visited_at IS NOT NULL) AS visited_count,
           STUFF((SELECT DISTINCT ',' + pr.channel FROM prospects pr WHERE pr.project_id = p.id AND pr.channel IS NOT NULL FOR XML PATH('')), 1, 1, '') AS channels
         FROM projects p
         WHERE p.is_active = 1
           AND EXISTS (SELECT 1 FROM prospects pr WHERE pr.project_id = p.id)
         ORDER BY p.name`
      : `SELECT * FROM projects WHERE is_active = 1 ORDER BY name`;
    const result = await db.request().query(query);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
