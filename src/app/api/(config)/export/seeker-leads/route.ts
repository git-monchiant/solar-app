import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET /api/export/seeker-leads — admin-only CSV of leads originated from
// prospects (source = 'seeker' OR linked from prospects.lead_id). Includes
// the seeker who created the prospect when available.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;

  const db = await getDb();
  const r = await db.request().query(`
    SELECT
      l.id,
      l.full_name,
      l.phone,
      l.email,
      l.house_number,
      l.installation_address,
      l.status,
      l.source,
      l.customer_type,
      pr.name AS project_name,
      l.note,
      l.requirement,
      au.full_name AS assigned_name,
      seeker_user.full_name AS seeker_name,
      p.id AS prospect_id,
      p.house_number AS prospect_house_number,
      p.channel AS prospect_channel,
      p.interest AS prospect_interest,
      l.created_at,
      l.contact_date,
      l.next_follow_up
    FROM leads l
    LEFT JOIN prospects p ON p.lead_id = l.id
    LEFT JOIN projects pr ON pr.id = COALESCE(p.project_id, l.project_id)
    LEFT JOIN users seeker_user ON seeker_user.id = p.visited_by
    LEFT JOIN users au ON au.id = l.assigned_user_id
    WHERE l.source = 'seeker' OR p.id IS NOT NULL
    ORDER BY l.created_at DESC
  `);

  const headers = [
    "id", "full_name", "phone", "email", "house_number", "installation_address",
    "status", "source", "customer_type", "project_name", "note", "requirement",
    "assigned_name", "seeker_name", "prospect_id", "prospect_house_number",
    "prospect_channel", "prospect_interest", "created_at", "contact_date", "next_follow_up",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, " ");
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of r.recordset) {
    lines.push(headers.map((h) => escape((row as Record<string, unknown>)[h])).join(","));
  }
  // ﻿ BOM so Excel opens UTF-8 Thai correctly.
  const csv = "﻿" + lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seeker-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
