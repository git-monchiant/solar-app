import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ทะเบียนโครงการของโมดูล O&M
// ★ ปัญหาที่หน้านี้ต้องแก้ได้: om_houses.project_name เก็บชื่อไม่ตรงกันภายในรหัสเดียวกัน 58 รหัส
//   (เช่น 00500 มีทั้ง "คลอง 1" และ "คลอง 2") หน้าจอควรยึด om_projects.name_th เป็นชื่อจริง
//   และแก้ชื่อได้จากที่นี่ แล้วดันกลับไปที่ om_houses ให้ตรงกันทั้งระบบ

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const onlyH = req.nextUrl.searchParams.get("type") !== "all";

  const db = await getOmDb();
  const r = await db.request().query(`
    SELECT p.project_id, p.name_th, p.name_en, p.project_type, p.brand, p.is_demo,
           CONVERT(char(10), p.synced_at, 23) synced_at,
           ISNULL(h.n, 0) houses, ISNULL(h.om, 0) om_houses, h.names_in_houses,
           ISNULL(u.n, 0) rem_units, ISNULL(t.n, 0) rem_transfers,
           CONVERT(char(10), u.last_sync, 23) rem_synced_at
    FROM om_projects p
    OUTER APPLY (
      SELECT COUNT(*) n, SUM(CASE WHEN x.is_om = 1 THEN 1 ELSE 0 END) om,
             COUNT(DISTINCT x.project_name) names_in_houses
      FROM om_houses x WHERE x.project_id = p.project_id) h
    OUTER APPLY (SELECT COUNT(*) n, MAX(synced_at) last_sync FROM om_rem_units x WHERE x.project_id = p.project_id) u
    OUTER APPLY (SELECT COUNT(*) n FROM om_rem_transfers x WHERE x.project_id = p.project_id) t
    ${onlyH ? "WHERE p.project_type = 'H'" : ""}
    ORDER BY ISNULL(h.om, 0) DESC, p.project_id`);
  const rows = r.recordset;
  return NextResponse.json({
    projects: rows,
    stats: {
      total: rows.length,
      used: rows.filter((x) => Number(x.om_houses) > 0).length,
      no_rem: rows.filter((x) => Number(x.rem_units) === 0).length,
      name_mismatch: rows.filter((x) => Number(x.names_in_houses) > 1).length,
    },
  });
}

// PATCH { project_id, name_th?, sync_house_names? }
//   sync_house_names: true → ดันชื่อจากทะเบียนไปทับ om_houses.project_name ให้ตรงกันทั้งรหัส
export async function PATCH(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const pid = typeof b.project_id === "string" ? b.project_id.trim() : "";
  if (!pid) return NextResponse.json({ error: "ต้องระบุ project_id" }, { status: 400 });

  const db = await getOmDb();
  const cur = (await db.request().input("p", sql.NVarChar(20), pid)
    .query(`SELECT project_id, name_th FROM om_projects WHERE project_id = @p`)).recordset[0];
  if (!cur) return NextResponse.json({ error: "ไม่พบโครงการนี้" }, { status: 404 });

  const name = typeof b.name_th === "string" ? b.name_th.trim() : null;
  if (name !== null && !name) return NextResponse.json({ error: "ชื่อโครงการว่างไม่ได้" }, { status: 400 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  let housesRenamed = 0;
  try {
    if (name) {
      await new sql.Request(tx).input("p", sql.NVarChar(20), pid).input("n", sql.NVarChar(200), name)
        .query(`UPDATE om_projects SET name_th = @n WHERE project_id = @p`);
    }
    if (b.sync_house_names === true) {
      const use = name || (cur.name_th as string);
      if (use) {
        const r = await new sql.Request(tx).input("p", sql.NVarChar(20), pid).input("n", sql.NVarChar(200), use)
          .query(`UPDATE om_houses SET project_name = @n, updated_at = SYSDATETIMEOFFSET()
                  WHERE project_id = @p AND ISNULL(project_name, N'') <> @n`);
        housesRenamed = r.rowsAffected[0];
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, project_id: pid, name_th: name ?? cur.name_th, housesRenamed });
}
