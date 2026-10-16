import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { commitLead, getLead } from "@/lib/om/sales-sweep";
import type { Candidate } from "@/lib/om/rem-match";

// ตัดสินรายการในคิวรอจับคู่
//   accept  — รับผู้สมัครที่ระบบเสนอ (หรือ contract ที่แอดมินเลือกจากรายการผู้สมัคร)
//   link    — ผูกกับบ้านที่มีอยู่แล้วในระบบ (แอดมินค้นเอง)
//   reject  — ไม่ใช่บ้านในโครงการ → สร้างเป็นบ้านของ "ลูกค้าทั่วไป" (ไม่ผูก REM)
// ★ ทั้ง 3 ทางจบด้วยการมีบ้าน+ลูกค้า+ระบบติดตั้งเสมอ — ลูกค้าที่ติดตั้งไปแล้วต้องได้รับบริการ
//   ไม่ใช่หายไปเพราะจับคู่ไม่ได้

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;

export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;

  const b = await req.json().catch(() => ({}));
  const leadId = Number(b.lead_id);
  const action = String(b.action ?? "");
  if (!leadId || !["accept", "link", "reject"].includes(action)) {
    return NextResponse.json({ error: "ต้องระบุ lead_id และ action (accept|link|reject)" }, { status: 400 });
  }

  const db = await getOmDb();
  const q = await db.request().input("l", sql.Int, leadId)
    .query(`SELECT tier, status, reason, cand_contract, candidates FROM om_match_queue WHERE lead_id = @l`);
  const row = q.recordset[0];
  if (!row) return NextResponse.json({ error: "ไม่พบรายการนี้ในคิว" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: `รายการนี้ตัดสินไปแล้ว (${row.status})` }, { status: 409 });

  const lead = await getLead(db, leadId);
  if (!lead) return NextResponse.json({ error: "ไม่พบงานขายนี้" }, { status: 404 });

  // กันกดซ้ำ — ถ้ามี installation ของ lead นี้แล้วแปลว่าเข้าระบบไปแล้ว
  const dup = await db.request().input("l", sql.Int, leadId)
    .query(`SELECT TOP 1 id, house_id FROM om_installations WHERE lead_id = @l`);
  if (dup.recordset[0]) {
    await db.request().input("l", sql.Int, leadId).input("h", sql.Int, dup.recordset[0].house_id)
      .query(`UPDATE om_match_queue SET status='accepted', house_id=@h, decided_at=SYSDATETIMEOFFSET() WHERE lead_id=@l`);
    return NextResponse.json({ ok: true, already: true, house_id: dup.recordset[0].house_id });
  }

  let cand: Candidate | null = null;
  let houseId: number | undefined;
  let reason = String(row.reason ?? "");

  if (action === "accept") {
    const list: Candidate[] = (() => { try { return JSON.parse(String(row.candidates ?? "[]")); } catch { return []; } })();
    const wanted = typeof b.contract_id === "string" ? b.contract_id : row.cand_contract;
    cand = list.find((x) => x.contract_id === wanted) ?? list[0] ?? null;
    if (!cand) return NextResponse.json({ error: "ไม่มีผู้สมัครให้รับ — ใช้ผูกกับบ้านที่มีอยู่ หรือตีกลับแทน" }, { status: 400 });
    reason = `แอดมินยืนยัน · ${reason}`;
  } else if (action === "link") {
    houseId = Number(b.house_id);
    if (!houseId) return NextResponse.json({ error: "ต้องระบุ house_id" }, { status: 400 });
    const h = await db.request().input("h", sql.Int, houseId).query(`SELECT id FROM om_houses WHERE id = @h`);
    if (!h.recordset[0]) return NextResponse.json({ error: "ไม่พบบ้านหลังนี้" }, { status: 404 });
    reason = `แอดมินผูกกับบ้าน #${houseId} เอง · ${reason}`;
  } else {
    reason = `แอดมินตัดสินว่าไม่ใช่บ้านในโครงการ → ลูกค้าทั่วไป · ${reason}`;
  }

  try {
    const out = await commitLead(db, lead, {
      candidate: cand, houseId, tier: row.tier, reason,
      actor: gate.userId ?? null, queueStatus: action === "reject" ? "rejected" : "accepted",
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
