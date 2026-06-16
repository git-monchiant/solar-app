import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizePhone } from "@/lib/utils/formatters";

// GET /api/export/seeker-prospects — admin-only CSV of prospects still in
// follow-up (not yet "interested"). Status buckets mirror the seeker
// dashboard legend:
//   ยังไม่ตัดสินใจ  → interest IN ('undecided','not_home')
//   ไม่สนใจ         → interest = 'not_interested'
//   ยังไม่ได้เยี่ยม → interest IS NULL
// `interested` prospects are excluded — they already flow through the
// "Lead จาก Seeker" export.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;

  const db = await getDb();
  const r = await db.request().query(`
    SELECT
      p.id,
      COALESCE(NULLIF(p.project_name, N''), pr.name) AS project_name,
      p.house_number,
      p.full_name,
      p.phone,
      p.interest,
      CASE
        WHEN p.interest IS NULL THEN N'ยังไม่ได้เยี่ยม'
        WHEN p.interest IN ('undecided','not_home') THEN N'ยังไม่ตัดสินใจ'
        WHEN p.interest = 'not_interested' THEN N'ไม่สนใจ'
        ELSE p.interest
      END AS follow_up_status,
      p.interest_reasons,
      p.interest_reason_note,
      p.contact_time,
      p.visit_count,
      p.visited_at,
      u.full_name AS visited_by_name,
      p.prospect_source,
      p.tag,
      p.created_at,
      p.updated_at
    FROM prospects p
    LEFT JOIN projects pr ON pr.id = p.project_id
    LEFT JOIN users u ON u.id = p.visited_by
    WHERE p.interest IS NULL
       OR p.interest IN ('undecided','not_home','not_interested')
    ORDER BY follow_up_status, project_name, p.house_number
  `);

  const headers = [
    "id", "project_name", "house_number", "full_name", "phone",
    "interest", "follow_up_status", "interest_reasons", "interest_reason_note",
    "contact_time", "visit_count", "visited_at", "visited_by_name",
    "prospect_source", "tag", "created_at", "updated_at",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, " ");
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of r.recordset) {
    const r0 = row as Record<string, unknown>;
    const normalized = normalizePhone(r0.phone as string | null);
    if (!normalized) continue; // drop rows with missing / unparseable phones
    r0.phone = normalized;
    lines.push(headers.map((h) => escape(r0[h])).join(","));
  }
  // ﻿ BOM so Excel opens UTF-8 Thai correctly.
  const csv = "﻿" + lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seeker-prospects-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
