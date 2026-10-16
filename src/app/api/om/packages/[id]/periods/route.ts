import { NextRequest, NextResponse } from "next/server";
import { sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { getOmDb } from "@/lib/om/line";
import { PACKAGE_EDIT_ROLES, PACKAGE_VIEW_ROLES } from "@/lib/role-permissions";
import { syncOmPricePeriods } from "@/lib/om/package-prices";

// ช่วงราคาของแพ็คเกจ O&M — ยกกติกาจาก /api/packages/[id]/periods ของฝั่งขาย
// (ไม่มีผ่อน/ประหยัด/Lead ที่ใช้ราคาเก่า เพราะค่าบริการ O&M ไม่มีของพวกนั้น)

type PeriodInput = {
  id?: number | null;
  price?: number | null;
  start_date?: string | null;
  expire_date?: string | null;
  is_active?: boolean;
};

/** วันนี้ตามเวลาไทย (ไม่ใช้ toISOString เพราะ UTC จะเพี้ยนไป 1 วันช่วงเช้ามืด) */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** คอลัมน์ DATE จาก driver เป็น Date เวลาไทย — อ่านด้วย getFullYear/Month/Date (เหตุผลเดียวกับฝั่งขาย) */
const dayOf = (v: unknown) => {
  if (!v) return "";
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};

/** ล็อก = ช่วงที่ Active หรือเริ่มไปแล้ว — เหลือแก้ได้เฉพาะช่วงอนาคตที่ยังไม่ถึงวันเริ่ม */
const isLocked = (row: { is_active: boolean; start_date: Date | string | null }) => {
  if (row.is_active) return true;
  const start = dayOf(row.start_date);
  return !!start && start <= todayStr();
};

const listPeriods = async (db: sql.ConnectionPool, id: number) => {
  const r = await db.request().input("pid", sql.Int, id).query(`
    SELECT id, price, start_date, expire_date, is_active FROM om_package_price_periods
    WHERE om_package_id = @pid ORDER BY ISNULL(start_date, '1900-01-01'), id`);
  return fixDates(r.recordset).map((row) => ({ ...row, price: Number(row.price), locked: isLocked(row as never) }));
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, PACKAGE_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await params).id);
  await syncOmPricePeriods();
  return NextResponse.json(await listPeriods(await getOmDb(), id));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, PACKAGE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const packageId = Number((await params).id);
  const body = await req.json().catch(() => null);
  const rows: PeriodInput[] | null = Array.isArray(body) ? body : null;
  if (!rows || rows.length === 0) return NextResponse.json({ error: "ต้องมีช่วงราคาอย่างน้อย 1 ช่วง" }, { status: 400 });
  if (rows.filter((r) => r.is_active).length > 1) {
    return NextResponse.json({ error: "ตั้งช่วงราคาที่ใช้งานได้ครั้งละ 1 ช่วงเท่านั้น" }, { status: 400 });
  }
  if (rows.some((r) => !(Number(r.price) > 0))) {
    return NextResponse.json({ error: "กรุณาระบุค่าบริการให้ครบทุกช่วง" }, { status: 400 });
  }

  const db = await getOmDb();
  const existing = (await db.request().input("pid", sql.Int, packageId)
    .query(`SELECT * FROM om_package_price_periods WHERE om_package_id = @pid`)).recordset;
  const byId = new Map(existing.map((r) => [r.id as number, r]));
  const keepIds = new Set(rows.map((r) => Number(r.id)).filter(Boolean));

  // ช่วงที่ล็อกแล้ว ห้ามลบ ห้ามแก้ราคา/วันที่ — ต้องเพิ่มช่วงใหม่แทน
  for (const prev of existing.filter(isLocked)) {
    const next = rows.find((r) => Number(r.id) === prev.id);
    const why = prev.is_active ? "ที่ใช้งานอยู่" : "ที่เริ่มไปแล้ว";
    if (!next) return NextResponse.json({ error: `ลบช่วงราคา${why}ไม่ได้ — เพิ่มช่วงราคาใหม่ในอนาคตแทน` }, { status: 409 });
    if (Number(next.price ?? 0) !== Number(prev.price ?? 0)
      || dayOf(next.start_date) !== dayOf(prev.start_date)
      || dayOf(next.expire_date) !== dayOf(prev.expire_date)) {
      return NextResponse.json({ error: `ช่วงราคา${why}แก้ไขไม่ได้ — เพิ่มช่วงราคาใหม่ในอนาคตแทน` }, { status: 409 });
    }
  }

  // ห้ามเริ่ม/หมดอายุย้อนหลัง และวันหมดอายุต้องไม่ก่อนวันเริ่ม
  for (const row of rows) {
    const prev = row.id ? byId.get(Number(row.id)) : null;
    const start = dayOf(row.start_date);
    const expire = dayOf(row.expire_date);
    if ((!prev || start !== dayOf(prev.start_date)) && start && start < todayStr()) {
      return NextResponse.json({ error: "สร้างช่วงราคาย้อนหลังไม่ได้ — วันที่เริ่มใช้ต้องเป็นวันนี้หรือหลังจากนั้น" }, { status: 400 });
    }
    if ((!prev || expire !== dayOf(prev.expire_date)) && expire && expire < todayStr()) {
      return NextResponse.json({ error: "วันหมดอายุย้อนหลังไม่ได้ — ต้องเป็นวันนี้หรือหลังจากนั้น" }, { status: 400 });
    }
    if (start && expire && expire < start) {
      return NextResponse.json({ error: "วันหมดอายุต้องไม่ก่อนวันที่เริ่มใช้" }, { status: 400 });
    }
  }

  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    await new sql.Request(tx).input("pid", sql.Int, packageId)
      .query(`UPDATE om_package_price_periods SET is_active = 0 WHERE om_package_id = @pid`);
    for (const prev of existing) {
      if (!keepIds.has(prev.id)) {
        await new sql.Request(tx).input("id", sql.Int, prev.id).query(`DELETE FROM om_package_price_periods WHERE id = @id`);
      }
    }
    for (const row of rows) {
      const bind = (r: sql.Request) => r
        .input("price", sql.Decimal(12, 2), Number(row.price))
        .input("start", sql.Date, toSqlDate(row.start_date ?? null))
        .input("expire", sql.Date, toSqlDate(row.expire_date ?? null))
        .input("act", sql.Bit, row.is_active ? 1 : 0);
      if (row.id && byId.has(Number(row.id))) {
        await bind(new sql.Request(tx).input("id", sql.Int, Number(row.id))).query(`
          UPDATE om_package_price_periods SET price = @price, start_date = @start, expire_date = @expire, is_active = @act
          WHERE id = @id`);
      } else {
        await bind(new sql.Request(tx).input("pid", sql.Int, packageId).input("uid", sql.Int, gate.userId ?? null)).query(`
          INSERT om_package_price_periods (om_package_id, price, start_date, expire_date, is_active, created_by)
          VALUES (@pid, @price, @start, @expire, @act, @uid)`);
      }
    }
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch { /* ignore */ }
    console.error("PUT /api/om/packages/[id]/periods error:", e);
    return NextResponse.json({ error: "บันทึกช่วงราคาไม่สำเร็จ" }, { status: 500 });
  }

  await syncOmPricePeriods({ force: true });   // ช่วงที่ถึงวันแล้วให้ Active + mirror ราคาทันที
  return NextResponse.json(await listPeriods(db, packageId));
}
