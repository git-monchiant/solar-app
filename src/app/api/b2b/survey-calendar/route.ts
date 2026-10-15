import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_VIEW_ROLES, B2B_STAGE, isIsoDate } from "@/lib/b2b/project";

// ปฏิทินนัดสำรวจ B2B (การ์ดสำรวจ & ติดตั้ง · เคาะ 15 ต.ค. แยกสำรวจแบบ B2C) — ?from=&to= (ไม่เกิน 62 วัน)
//   events  = โครงการที่มีวันนัดสำรวจในช่วง (รวมที่สำรวจเสร็จแล้ว/ขยับขั้นไปแล้ว ไว้ดูย้อนหลัง)
//   waiting = โครงการขั้นสำรวจที่ยังไม่ได้นัด (ไม่ขึ้นกับช่วง — โชว์ข้างปฏิทิน)
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_VIEW_ROLES);
  if (gate.error) return gate.error;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) return NextResponse.json({ error: "ช่วงวันที่ยาวเกินไป" }, { status: 400 });
  const db = await getB2bDb();
  const cols = `p.id, p.code, p.name, c.name AS customer_name, p.location, p.stage, CONVERT(char(10), p.survey_date, 23) AS survey_date,
                u.full_name AS surveyor_name, CASE WHEN p.survey_done_at IS NULL THEN 0 ELSE 1 END AS survey_done`;
  const from_ = `FROM b2b_projects p JOIN b2b_customers c ON c.id = p.customer_id LEFT JOIN users u ON u.id = p.surveyor_id`;
  const [events, waiting] = await Promise.all([
    db.request().input("f", sql.Date, from).input("t", sql.Date, to)
      .query(`SELECT ${cols} ${from_} WHERE p.survey_date BETWEEN @f AND @t ORDER BY p.survey_date, p.id`),
    db.request().query(`SELECT ${cols} ${from_} WHERE p.stage = ${B2B_STAGE.survey} AND p.survey_date IS NULL ORDER BY p.updated_at DESC`),
  ]);
  const map = (r: Record<string, unknown>) => ({ ...r, survey_done: !!r.survey_done });
  return NextResponse.json({ events: events.recordset.map(map), waiting: waiting.recordset.map(map) });
}
