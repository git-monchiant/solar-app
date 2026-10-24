import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { commitLead, getLead } from "@/lib/om/sales-sweep";
import type { Candidate } from "@/lib/om/rem-match";
import { omErrorText } from "@/lib/om/api-error";

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
    return NextResponse.json({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await getOmDb();
  const q = await db.request().input("l", sql.Int, leadId)
    .query(`SELECT tier, status, reason, cand_contract, candidates FROM om_match_queue WHERE lead_id = @l`);
  const row = q.recordset[0];
  if (!row) return NextResponse.json({ error: "ไม่พบรายการนี้ในคิว" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: "รายการนี้ดำเนินการแล้ว" }, { status: 409 });

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
    if (!cand) return NextResponse.json({ error: "ไม่พบบ้านที่ระบบจับคู่ไว้ — กรุณาเชื่อมโยงกับบ้านที่มีอยู่ หรือเลือก \"ไม่ใช่บ้านในโครงการ\" แทน" }, { status: 400 });
    reason = `ผู้ดูแลระบบยืนยัน · ${reason}`;
  } else if (action === "link") {
    houseId = Number(b.house_id);
    if (!houseId) return NextResponse.json({ error: "กรุณาเลือกบ้าน" }, { status: 400 });
    const h = await db.request().input("h", sql.Int, houseId).query(`SELECT id, house_number FROM om_houses WHERE id = @h`);
    if (!h.recordset[0]) return NextResponse.json({ error: "ไม่พบบ้านหลังนี้" }, { status: 404 });
    reason = `ผู้ดูแลระบบเชื่อมโยงกับบ้านเลขที่ ${h.recordset[0].house_number ?? "-"} เอง · ${reason}`;
  } else {
    reason = `ผู้ดูแลระบบระบุว่าไม่ใช่บ้านในโครงการ (ลูกค้าทั่วไป) · ${reason}`;
  }

  try {
    const out = await commitLead(db, lead, {
      candidate: cand, houseId, tier: row.tier, reason,
      actor: gate.userId ?? null, queueStatus: action === "reject" ? "rejected" : "accepted",
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: omErrorText(e, "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/sweep/queue") }, { status: 500 });
  }
}
