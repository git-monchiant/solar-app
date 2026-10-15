import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { getOmDb } from "@/lib/om/line";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { findHouseConflicts, normHouseNumber, normIdCard, normPhone } from "@/lib/om/manual-house";

// ฟอร์ม "+ เพิ่มบ้าน" (แผน 20261014-08) — เช็คซ้ำระหว่างพิมพ์ · ตอนบันทึก POST /api/om/houses เช็คซ้ำอีกรอบใน transaction
// GET ?phone=&id_card=&project=&house_number=[&with=projects]
//   with=projects → ส่งรายชื่อโครงการแนวราบไปด้วย (เรียกครั้งเดียวตอนเปิดฟอร์ม)
//   ★ /api/om/projects ใช้ไม่ได้ — เป็นหน้าตั้งค่าของแอดมิน role ทีม O&M อื่นได้ 403
export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;

  const u = req.nextUrl.searchParams;
  const db = await getOmDb();
  const conflicts = await findHouseConflicts(() => db.request(), {
    phone: normPhone(u.get("phone")),
    idCard: normIdCard(u.get("id_card")),
    projectId: (u.get("project") ?? "").trim() || null,
    houseNumber: normHouseNumber(u.get("house_number")),
  });
  if (u.get("with") !== "projects") return NextResponse.json({ conflicts });

  // แนวราบเท่านั้น (ฟอร์มสร้าง segment 'house') · ไม่เอาโครงการบ้านตัวอย่าง
  const pj = await db.request().query(`
    SELECT project_id, name_th FROM om_projects
     WHERE ISNULL(project_type, 'H') = 'H' AND is_demo = 0
     ORDER BY name_th`);
  return NextResponse.json({ conflicts, projects: pj.recordset });
}
