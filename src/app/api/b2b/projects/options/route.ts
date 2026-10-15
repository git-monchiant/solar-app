import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { B2B_PROJECT_ROLES } from "@/lib/b2b/project";
import { loadB2bUsers } from "@/lib/b2b/project-server";

// ตัวเลือกของฟอร์มโครงการ — ผู้ดูแล/ผู้สำรวจ (role b2b) + บริษัทลูกค้าที่มีอยู่ (ไม่กี่สิบแถว ส่งทั้งหมดให้ค้นในหน้าจอ)
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const db = await getB2bDb();
  const [users, customers] = await Promise.all([
    loadB2bUsers(db),
    db.request().query(`SELECT id, name, tax_id, branch, address FROM b2b_customers ORDER BY name`).then((r) => r.recordset),
  ]);
  return NextResponse.json({ users, customers });
}
