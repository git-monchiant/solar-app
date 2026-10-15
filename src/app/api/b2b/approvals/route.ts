import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { REVIEW_ROLE, type ReviewTier } from "@/lib/b2b/quotation";

// คิวอนุมัติใบเสนอราคา B2B — ผู้ตรวจสอบเห็นเฉพาะชั้นของตัวเอง (role ที่สวมอยู่) · admin เห็นทุกชั้น
// เรียงตามเวลาส่ง (มาก่อนตรวจก่อน) · ตัวเลขต้นทุน/ราคาขายของ BOQ มาจาก snapshot ตอนส่ง
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, ["b2b_review1", "b2b_review2", "b2b_review3", "admin"]);
  if (gate.error) return gate.error;
  const tiers = gate.roles.includes("admin")
    ? [1, 2, 3]
    : ([1, 2, 3] as ReviewTier[]).filter((t) => gate.roles.includes(REVIEW_ROLE[t]));
  if (tiers.length === 0) return NextResponse.json([]);
  const db = await getB2bDb();
  const r = await db.request().query(`
    SELECT q.id, q.doc_no, q.revision, q.kind, q.status, q.subtotal, q.total, q.submitted_at, q.proposer_name,
           q.r1_name, q.r2_name, JSON_VALUE(q.snapshot_json, '$.boq.total_cost') AS boq_cost,
           JSON_VALUE(q.snapshot_json, '$.boq.capacity_wp') AS capacity_wp,
           p.id AS project_id, p.code AS project_code, p.name AS project_name, c.name AS customer_name, b.option_label
    FROM b2b_quotations q
    JOIN b2b_projects p ON p.id = q.project_id
    JOIN b2b_customers c ON c.id = p.customer_id
    JOIN b2b_boqs b ON b.id = q.boq_id
    WHERE q.is_latest = 1 AND q.status IN (${tiers.map((t) => `'pending_review${t}'`).join(",")})
    ORDER BY q.submitted_at, q.id`);
  return NextResponse.json(r.recordset.map((x) => ({
    ...x, subtotal: Number(x.subtotal), total: Number(x.total),
    boq_cost: x.boq_cost == null ? null : Number(x.boq_cost), capacity_wp: x.capacity_wp == null ? null : Number(x.capacity_wp),
  })));
}
