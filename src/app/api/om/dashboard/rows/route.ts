import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole, requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { isCleaning } from "@/lib/om/entitlement";
import { OM_FOLLOW_DROP_SQL, OM_FOLLOW_SCOPE_SQL } from "@/lib/om/follow-sql";
import { getSettings } from "@/lib/om/settings";
import { TABS } from "@/lib/om/service-view";
import { omErrorText } from "@/lib/om/api-error";
import {
  DUE_WASH_SQL, EVER_WASHED_SQL, HOUSE_GRANTED_SQL, HOUSE_INFO_COLS, HOUSE_USED_SQL, OM_CARED_HOUSE_SQL,
  OM_MONEY_ROLES, dashRange, inRange, loadOmQuoteMoney,
} from "@/lib/om/dashboard-sql";

// GET /api/om/dashboard/rows — รายชื่อหลังตัวเลขบนหน้าภาพรวม O&M (แผน 20261015-02)
// ★ กดตัวเลขแล้วเปิดหน้าต่างรายชื่อแบบ Dashboard I — จำนวนแถวต้องเท่ากับตัวเลขที่กดเสมอ
//   ⇒ ทุก kind ใช้นิยามชุดเดียวกับ /api/om/dashboard (dashboard-sql.ts · follow-sql.ts) ห้ามเขียนเกณฑ์ใหม่
//
//   kind=tab&k=follow,quote&group=<project_id>   แถวงานบริการ (#x ของหน้ารายการ) · k=all = ทุกแท็บยกเว้นปิดงาน
//   kind=house&scope=all|due|not_due            บ้านในความดูแล
//   kind=quota&scope=left|granted|used          บ้าน + สิทธิ์ให้/ใช้/เหลือ
//   kind=washed&from&to                         งานล้างที่ทำจริงในช่วง (แท่งรายเดือน)
//   kind=value&scope=total|received|outstanding&from&to   ใบเสนอราคา O&M + เงิน (role เห็นเงินเท่านั้น)

const TAB_KEYS = new Set<string>(TABS.map((t) => t.k));

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const kind = u.get("kind") ?? "";
  const scope = u.get("scope") ?? "";
  const db = await getOmDb();

  try {
    if (kind === "tab") {
      const raw = (u.get("k") ?? "").split(",").map((s) => s.trim());
      // k=all = ทุกแท็บยกเว้นปิดงาน — เลขการ์ด "งานในลิสต์บริการ" (= badge การ์ด O&M หน้าแรก)
      const keys = raw.includes("all") ? [...TAB_KEYS].filter((k) => k !== "closed") : raw.filter((k) => TAB_KEYS.has(k));
      if (!keys.length) return NextResponse.json({ error: "ไม่พบแท็บที่ระบุ" }, { status: 400 });
      const cfg = await getSettings("call.");
      // keys ผ่าน TAB_KEYS แล้ว (ค่าคงที่ในโค้ด) — ต่อเป็น IN ได้ปลอดภัย
      const r = await db.request()
        .input("max", sql.Int, Number(cfg["call.max_attempts"] ?? 3))
        .input("g", sql.NVarChar(20), (u.get("group") ?? "").trim())
        .query(`
        ${OM_FOLLOW_SCOPE_SQL}
        SELECT d.house_id, d.house_number, d.customer_name, d.phone, d.project_name, d.bucket,
               d.balance, d.last_wash, d.booking_id, d.job_status
          FROM #x d
         WHERE d.bucket IN (${keys.map((k) => `'${k}'`).join(",")})
           AND (@g = '' OR d.project_id = @g)
         ORDER BY d.project_name, d.house_number;
        ${OM_FOLLOW_DROP_SQL}`);
      return NextResponse.json({ rows: fixDates(r.recordset) });
    }

    if (kind === "house") {
      const where = scope === "due" ? `AND ${DUE_WASH_SQL}` : scope === "not_due" ? `AND NOT ${DUE_WASH_SQL}` : "";
      const r = await db.request().query(`
        SELECT ${HOUSE_INFO_COLS},
               ${HOUSE_GRANTED_SQL} - ${HOUSE_USED_SQL} balance,
               CASE WHEN ${DUE_WASH_SQL} THEN 1 ELSE 0 END due,
               CASE WHEN ${EVER_WASHED_SQL} THEN 0 ELSE 1 END never_washed
          FROM om_houses h
          LEFT JOIN om_projects pj ON pj.project_id = h.project_id
         WHERE ${OM_CARED_HOUSE_SQL} ${where}
         ORDER BY ISNULL(pj.name_th, h.project_name), h.house_number;`);
      return NextResponse.json({ rows: fixDates(r.recordset) });
    }

    if (kind === "quota") {
      // ผลรวมคอลัมน์ = ตัวเลขบนการ์ดสิทธิ์ (⑥ นับเฉพาะบ้าน is_om = 1) · ตัดบ้านที่คอลัมน์นั้นเป็น 0 ออก
      const having = scope === "granted" ? "granted <> 0" : scope === "used" ? "used <> 0" : "granted - used <> 0";
      const r = await db.request().query(`
        SELECT * FROM (
          SELECT ${HOUSE_INFO_COLS}, ${HOUSE_GRANTED_SQL} granted, ${HOUSE_USED_SQL} used
            FROM om_houses h
            LEFT JOIN om_projects pj ON pj.project_id = h.project_id
           WHERE h.is_om = 1) a
         WHERE ${having}
         ORDER BY a.project_name, a.house_number;`);
      return NextResponse.json({ rows: fixDates(r.recordset).map((x) => ({ ...x, left: Number(x.granted) - Number(x.used) })) });
    }

    if (kind === "washed") {
      // เกณฑ์เดียวกับ ⑦ ของ /api/om/dashboard (ไม่กรอง is_om — กราฟนับงานล้างทุกใบที่เกิดจริง)
      const { from, to } = dashRange(u);
      const r = await db.request().input("from", sql.Date, from).input("to", sql.Date, to).query(`
        SELECT ${HOUSE_INFO_COLS},
               CONVERT(char(10), rd.service_date, 23) service_date, rd.booking_id
          FROM om_redemptions rd
          JOIN om_installations i ON i.id = rd.installation_id
          JOIN om_houses h ON h.id = i.house_id
          LEFT JOIN om_projects pj ON pj.project_id = h.project_id
         WHERE rd.status <> 'void' AND ${isCleaning("rd")}
           AND rd.service_date >= @from AND rd.service_date <= @to
         ORDER BY rd.service_date DESC, h.house_number;`);
      return NextResponse.json({ rows: fixDates(r.recordset) });
    }

    if (kind === "value") {
      if ((await requireAnyActiveRole(req, OM_MONEY_ROLES)).error)
        return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงมูลค่างาน O&M" }, { status: 403 });
      const { from, to } = dashRange(u);
      const all = await loadOmQuoteMoney(db);
      // ชุดเดียวกับการ์ดมูลค่างาน: มูลค่า/รับแล้ว = ใบที่ลูกค้ารับในช่วง · ค้างรับ = ทุกใบ
      const rows = scope === "outstanding" ? all.filter((x) => x.outstanding > 0)
        : all.filter((x) => inRange(x.at, from, to) && (scope !== "received" || x.received > 0));
      return NextResponse.json({ rows });
    }

    return NextResponse.json({ error: "ไม่พบชุดข้อมูลที่ระบุ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: omErrorText(e, "โหลดรายชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "GET /api/om/dashboard/rows") }, { status: 500 });
  }
}
