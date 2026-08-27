import { NextRequest, NextResponse } from "next/server";
import { authenticateLiff, readJsonBody } from "@/lib/om/liff-auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ข้อมูล "บ้านของฉัน" ของลูกค้า LIFF — รองรับหลายบ้านต่อคน (แบบ A: ตัวสลับบ้าน)
// บ้านทั้งหมดมาจาก om_line_user_houses · บ้านที่กำลังดู = om_line_users.house_id (fallback หลังแรก)

async function getLinkedHouses(lineUserId: string) {
  const db = await getOmDb();
  const r = await db.request()
    .input("id", sql.NVarChar(64), lineUserId)
    .query(`
      SELECT h.id, h.house_number, h.segment, p.name_th AS project_name,
             ISNULL(b.balance, 0) AS balance
      FROM om_line_user_houses luh
      JOIN om_houses h ON h.id = luh.house_id
      LEFT JOIN om_projects p ON p.project_id = h.project_id
      LEFT JOIN (SELECT house_id, SUM(balance) balance FROM om_entitlement_balance GROUP BY house_id) b
        ON b.house_id = h.id
      WHERE luh.line_user_id = @id
      ORDER BY luh.linked_at`);
  return r.recordset;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateLiff(req);
  if (auth.denied) return auth.denied;
  const lineUserId = auth.identity.lineUserId;

  const db = await getOmDb();
  const houses = await getLinkedHouses(lineUserId);
  if (houses.length === 0) {
    const u = await db.request().input("id", sql.NVarChar(64), lineUserId)
      .query(`SELECT identity_status FROM om_line_users WHERE line_user_id = @id`);
    return NextResponse.json(
      { linked: false, identity_status: u.recordset[0]?.identity_status ?? "unknown" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const act = await db.request().input("id", sql.NVarChar(64), lineUserId)
    .query(`SELECT house_id FROM om_line_users WHERE line_user_id = @id`);
  let activeId: number = act.recordset[0]?.house_id ?? houses[0].id;
  if (!houses.some((h) => h.id === activeId)) activeId = houses[0].id;

  const [house, installation, redemptions] = await Promise.all([
    db.request().input("hid", sql.Int, activeId).query(`
      SELECT h.id, h.house_number, h.segment, h.unit_status, p.name_th AS project_name, p.brand
      FROM om_houses h LEFT JOIN om_projects p ON p.project_id = h.project_id
      WHERE h.id = @hid`),
    db.request().input("hid", sql.Int, activeId).query(`
      SELECT TOP 1 id, inverter_brand, rem_size_kwp,
             CAST(warranty_start AS date) AS warranty_start,
             CAST(DATEADD(year, 2,  warranty_start) AS date) AS warranty_install_until,
             CAST(DATEADD(year, 5,  warranty_start) AS date) AS warranty_inverter_until,
             CAST(DATEADD(year, 10, warranty_start) AS date) AS warranty_panel_until
      FROM om_installations WHERE house_id = @hid ORDER BY id`),
    db.request().input("hid", sql.Int, activeId).query(`
      SELECT TOP 10 CAST(r.service_date AS date) AS service_date, r.status
      FROM om_redemptions r
      JOIN om_installations i ON i.id = r.installation_id
      WHERE i.house_id = @hid AND r.status <> 'void'
      ORDER BY r.service_date DESC`),
  ]);

  return NextResponse.json(
    {
      linked: true,
      houses: houses.map((h) => ({ ...h, is_active: h.id === activeId })),
      house: fixDates(house.recordset)[0] ?? null,
      installation: fixDates(installation.recordset)[0] ?? null,
      remaining: houses.find((h) => h.id === activeId)?.balance ?? 0,
      redemptions: fixDates(redemptions.recordset),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST { house_id } — สลับบ้านที่กำลังดู (ต้องเป็นบ้านที่ผูกกับ user นี้เท่านั้น)
export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const auth = await authenticateLiff(req, body);
  if (auth.denied) return auth.denied;

  const houseId = Number(body?.house_id);
  if (!Number.isInteger(houseId)) {
    return NextResponse.json({ error: "house_id จำเป็น" }, { status: 400 });
  }
  const houses = await getLinkedHouses(auth.identity.lineUserId);
  if (!houses.some((h) => h.id === houseId)) {
    return NextResponse.json({ error: "บ้านนี้ไม่ได้ผูกกับบัญชีของคุณ" }, { status: 403 });
  }

  const db = await getOmDb();
  await db.request()
    .input("id", sql.NVarChar(64), auth.identity.lineUserId)
    .input("hid", sql.Int, houseId)
    .query(`UPDATE om_line_users SET house_id = @hid WHERE line_user_id = @id;
            IF @@ROWCOUNT = 0
              INSERT INTO om_line_users (line_user_id, house_id, identity_status) VALUES (@id, @hid, 'verified');`);
  return NextResponse.json({ ok: true });
}
