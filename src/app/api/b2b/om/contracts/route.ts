import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_STAGE, isIsoDate } from "@/lib/b2b/project";
import { B2B_OM_ROLES } from "@/lib/b2b/om";
import { createOmContract, listContracts } from "@/lib/b2b/om-server";

// สัญญา O&M B2B (แผน 20261015-09)
//   GET  รายการสัญญาทุกโครงการ
//   POST { project_id, years, visits_per_year, start_date } สร้างเองที่หน้าโครงการ — ปกติสร้างเองตอนปิดโครงการ
//        ใช้เมื่อ: ใบไม่ได้ใส่ O&M แต่ลูกค้าซื้อเพิ่ม · หรือส่งมอบแล้วแต่งวดสุดท้ายยังค้าง (อยากเริ่มนัดก่อนปิดโครงการ)
//        ต้องบันทึกส่งมอบแล้ว · โครงการละ 1 สัญญาในเฟสนี้ (ต่อสัญญาเฟส 4)
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  return NextResponse.json(await listContracts(await getB2bDb()));
}

const intIn = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export async function POST(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const projectId = intIn(b.project_id, 1, 2 ** 31 - 1);
  const years = intIn(b.years, 1, 30);
  const perYear = intIn(b.visits_per_year, 1, 24);
  if (!projectId) return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 400 });
  if (!years || !perYear) return NextResponse.json({ error: "จำนวนปี (1–30) / ครั้งต่อปี (1–24) ไม่ถูกต้อง" }, { status: 400 });
  if (!isIsoDate(b.start_date)) return NextResponse.json({ error: "กรุณาระบุวันเริ่มสัญญา" }, { status: 400 });

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const p = (await new sql.Request(tx).input("p", sql.Int, projectId).query(`
      SELECT p.stage, (SELECT COUNT(*) FROM b2b_project_milestones m WHERE m.project_id = p.id AND m.kind = 'handover') AS handed,
             (SELECT COUNT(*) FROM b2b_om_contracts c WHERE c.project_id = p.id) AS contracts
      FROM b2b_projects p WITH (UPDLOCK) WHERE p.id = @p`)).recordset[0];
    const fail = (msg: string, status = 400) => { void tx.rollback().catch(() => {}); return NextResponse.json({ error: msg }, { status }); };
    if (!p) return fail("ไม่พบโครงการ", 404);
    if (!(p.stage === B2B_STAGE.closed || (p.stage === B2B_STAGE.handover && p.handed > 0))) return fail("สร้างสัญญา O&M ได้หลังบันทึกส่งมอบงานแล้ว");
    if (p.contracts > 0) return fail("โครงการนี้มีสัญญา O&M แล้ว");
    const id = await createOmContract(tx, projectId, gate.userId, { years, visits_per_year: perYear, start_date: b.start_date });
    await tx.commit();
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/b2b/om/contracts error:", e);
    return NextResponse.json({ error: "สร้างสัญญาไม่สำเร็จ" }, { status: 500 });
  }
}
