import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";

// แจ้งเตือน B2B ของผู้ใช้ (แผน 20261015-11) — กระดิ่งกลางดึงมารวมกับ /api/notifications ฝั่งหน้าจอ
//   GET ?summary=1 → { unread_count } · GET → { items (50 ล่าสุด), unread_count } รูปเดียวกับแจ้งเตือนกลาง (notification_source = "b2b")
//   PATCH { id } อ่านแล้ว · { all: true } อ่านทั้งหมด
// ฐานที่ไม่ใช่ v3 / ยังไม่รัน migration → ตอบว่างแทน error (กระดิ่งต้องไม่พังเพราะส่วนนี้)
const EMPTY = { items: [], unread_count: 0 };

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const summary = req.nextUrl.searchParams.get("summary") === "1";
  try {
    const db = await getB2bDb();
    const unread = (await db.request().input("u", sql.Int, gate.userId)
      .query(`SELECT COUNT(*) AS n FROM b2b_notifications WHERE recipient_user_id = @u AND read_at IS NULL AND resolved_at IS NULL`)).recordset[0].n;
    if (summary) return NextResponse.json({ unread_count: unread });
    // ยังรอชั้นที่แจ้งอยู่ → ไปคิวอนุมัติ (เลือกใบให้) · ไม่งั้นไปหน้าใบเสนอราคา
    const r = await db.request().input("u", sql.Int, gate.userId).query(`
      SELECT TOP 50 n.id, 'b2b' AS notification_source, 0 AS lead_id, n.quotation_id, n.kind AS notification_type, NULL AS approval_stage,
             n.title, n.message, n.read_at, n.created_at, n.resolved_at, q.doc_no + ' Rev ' + CAST(q.revision AS VARCHAR(5)) AS doc_no,
             q.status AS quotation_status, c.name AS customer_name, cu.full_name AS created_by_name,
             CASE WHEN n.kind = 'approval_requested' AND n.resolved_at IS NULL AND q.status = 'pending_review' + CAST(n.tier AS VARCHAR(1))
                  THEN '/b2b/approvals?quote=' + CAST(n.quotation_id AS VARCHAR(12))
                  ELSE '/b2b/quotations/' + CAST(n.quotation_id AS VARCHAR(12)) END AS target_url
      FROM b2b_notifications n
      LEFT JOIN b2b_quotations q ON q.id = n.quotation_id
      LEFT JOIN b2b_projects p ON p.id = n.project_id
      LEFT JOIN b2b_customers c ON c.id = p.customer_id
      LEFT JOIN users cu ON cu.id = n.created_by
      WHERE n.recipient_user_id = @u
      ORDER BY n.created_at DESC, n.id DESC`);
    return NextResponse.json({ items: r.recordset, unread_count: unread });
  } catch (e) {
    console.warn("GET /api/b2b/notifications — ตอบว่าง:", e instanceof Error ? e.message : e);
    return NextResponse.json(summary ? { unread_count: 0 } : EMPTY);
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (b.all !== true && !Number.isInteger(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  try {
    const db = await getB2bDb();
    await db.request().input("u", sql.Int, gate.userId).input("id", sql.BigInt, b.all === true ? null : id).query(`
      UPDATE b2b_notifications SET read_at = SYSDATETIMEOFFSET()
      WHERE recipient_user_id = @u AND read_at IS NULL AND (@id IS NULL OR id = @id)`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn("PATCH /api/b2b/notifications:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false });
  }
}
