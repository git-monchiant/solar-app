import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { syncActivePricePeriods } from "@/lib/package-prices";

type PeriodInput = {
  id?: number | null;
  price?: number | null;
  monthly_installment?: string | null;
  monthly_saving?: number | null;
  start_date?: string | null;
  expire_date?: string | null;
  is_active?: boolean;
  note?: string | null;
  allowed_lead_ids?: string | null;
};

/** '123, 333,444' → '123,333,444' (เก็บเฉพาะตัวเลข ไม่ซ้ำ เรียงตามที่พิมพ์) */
const normalizeLeadIds = (value: unknown) => {
  const ids = String(value ?? "")
    .split(/[^0-9]+/)
    .filter(Boolean);
  return ids.length ? [...new Set(ids)].join(",") : null;
};

/** วันนี้ตามเวลาไทย (ไม่ใช้ toISOString เพราะ UTC จะเพี้ยนไป 1 วันช่วงเช้ามืด) */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** คอลัมน์ DATE จาก driver เป็น Date object — ต้องอ่านด้วย getFullYear/Month/Date
    ห้ามใช้ String(date).slice() (V8 อ่าน "Sat Aug 01" เป็นปี 2001) และห้ามใช้
    toISOString() เพราะ pool ตั้ง useUTC:false ค่าที่ได้จึงเป็นเที่ยงคืนเวลาไทย
    พอแปลงเป็น UTC จะถอยไป 1 วัน (2026-08-01 → 2026-07-31) */
const dayOf = (v: unknown) => {
  if (!v) return "";
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** ช่วงที่ล็อก = แก้ไข/ลบไม่ได้เลย มี 2 กรณี
      1) ช่วงที่ใช้งานอยู่ (Active)
      2) ช่วงที่เริ่มไปแล้ว (เดือนที่ผ่านมา) แม้จะ Inactive — ราคาที่เคยใช้ออกใบเสนอราคาห้ามแก้ย้อนหลัง
    เหลือแก้ได้เฉพาะช่วงในอนาคตที่ยังไม่ถึงวันเริ่ม */
const isLocked = (row: { is_active: boolean; start_date: Date | string | null }) => {
  if (row.is_active) return true;
  const start = dayOf(row.start_date);
  return !!start && start <= todayStr();
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, ["admin", "sales", "sales_sup", "solar", "solar_sup"]);
  if (gate.error) return gate.error;
  const { id } = await params;
  await syncActivePricePeriods();          // สลับ Active ตามวันที่ก่อนอ่าน
  const db = await getDb();
  const r = await db.request().input("pid", sql.Int, Number(id)).query(`
    SELECT * FROM package_price_periods WHERE package_id=@pid
    ORDER BY ISNULL(start_date,'1900-01-01'), id
  `);
  return NextResponse.json(fixDates(r.recordset).map(row => ({ ...row, locked: isLocked(row as never) })));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, ["admin", "sales", "solar", "solar_sup"]);
  if (gate.error) return gate.error;
  const { id } = await params;
  const packageId = Number(id);
  const body = await req.json();
  const rows: PeriodInput[] = Array.isArray(body) ? body : body?.periods;
  if (!Array.isArray(rows)) return NextResponse.json({ error: "periods ต้องเป็น array" }, { status: 400 });

  // ไม่บังคับว่าต้องมี active — syncActivePricePeriods จะตั้งให้เองตามวันที่
  if (rows.filter(r => r.is_active).length > 1) {
    return NextResponse.json({ error: "ตั้งช่วงราคาที่ใช้งานได้ครั้งละ 1 ช่วงเท่านั้น" }, { status: 400 });
  }

  const db = await getDb();
  const existing = (await db.request().input("pid", sql.Int, packageId)
    .query(`SELECT * FROM package_price_periods WHERE package_id=@pid`)).recordset;
  const byId = new Map(existing.map(r => [r.id as number, r]));
  const keepIds = new Set(rows.map(r => Number(r.id)).filter(Boolean));

  // ช่วงที่ล็อกแล้วห้ามลบ และห้ามแก้ตัวเลขราคา — ต้องเพิ่มช่วงใหม่แล้ว active แทน
  for (const prev of existing.filter(isLocked)) {
    const next = rows.find(r => Number(r.id) === prev.id);
    const why = prev.is_active ? "ที่ใช้งานอยู่" : "ของเดือนที่ผ่านมาแล้ว";
    if (!next) {
      return NextResponse.json({ error: `ลบช่วงราคา${why}ไม่ได้ — เพิ่มช่วงราคาใหม่ในอนาคตแทน` }, { status: 409 });
    }
    // ช่วงที่ใช้งานอยู่ = ล็อกทุกช่อง (ราคา/ผ่อน/ประหยัด/วันเริ่ม/วันหมดอายุ)
    // หมายเหตุ: ปลด is_active ได้ เพราะการสลับไปใช้ช่วงใหม่ต้องปิดช่วงเดิมก่อน
    const diffs: string[] = [];
    if (Number(next.price ?? 0) !== Number(prev.price ?? 0)) diffs.push(`ราคา ${prev.price} → ${next.price}`);
    if (text(next.monthly_installment) !== (prev.monthly_installment ?? null)) diffs.push(`ผ่อน/เดือน ${prev.monthly_installment ?? "-"} → ${next.monthly_installment ?? "-"}`);
    if ((num(next.monthly_saving) ?? null) !== (prev.monthly_saving === null ? null : Number(prev.monthly_saving))) diffs.push(`ประหยัด/เดือน ${prev.monthly_saving ?? "-"} → ${next.monthly_saving ?? "-"}`);
    if (dayOf(next.start_date) !== dayOf(prev.start_date)) diffs.push(`วันเริ่ม ${dayOf(prev.start_date)} → ${dayOf(next.start_date)}`);
    if (dayOf(next.expire_date) !== dayOf(prev.expire_date)) diffs.push(`วันหมดอายุ ${dayOf(prev.expire_date)} → ${dayOf(next.expire_date)}`);
    if (diffs.length) {
      console.warn(`ช่วงราคา id=${prev.id} ถูกล็อกแต่มีการแก้: ${diffs.join(", ")}`);
      return NextResponse.json(
        { error: `ช่วงราคา${why}แก้ไขไม่ได้ — เพิ่มช่วงราคาใหม่ในอนาคตแทน` },
        { status: 409 },
      );
    }
  }

  // รายชื่อ Lead ที่ยังใช้ราคาเก่าได้ — admin เท่านั้นที่แก้ได้
  const isAdmin = (gate.roles ?? []).includes("admin");
  if (!isAdmin) {
    const changedLeads = rows.some(r => {
      const prev = r.id ? byId.get(Number(r.id)) : null;
      return normalizeLeadIds(r.allowed_lead_ids) !== (prev?.allowed_lead_ids ?? null);
    });
    if (changedLeads) {
      return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบเท่านั้นที่กำหนด Lead ที่ใช้ราคาเก่าได้" }, { status: 403 });
    }
  }

  // ทุกช่วงต้องมีราคาขาย — ปล่อยว่างไว้แล้ว mirror ไป packages.price = 0 จะทำให้ขายที่ 0 บาท
  if (rows.some(r => !(Number(r.price) > 0))) {
    return NextResponse.json({ error: "กรุณาระบุราคาขายให้ครบทุกช่วง" }, { status: 400 });
  }

  // ห้ามสร้าง/ย้ายช่วงราคาไปเริ่มในอดีต — ราคาที่ออกใบเสนอราคาไปแล้วต้องไม่ถูกเขียนทับย้อนหลัง
  for (const row of rows) {
    const start = dayOf(row.start_date);
    const prev = row.id ? byId.get(Number(row.id)) : null;
    const isNew = !prev;
    const movedStart = !!prev && start !== dayOf(prev.start_date);
    if ((isNew || movedStart) && start && start < todayStr()) {
      return NextResponse.json(
        { error: "สร้างช่วงราคาย้อนหลังไม่ได้ — วันที่เริ่มใช้ต้องเป็นวันนี้หรือหลังจากนั้น" },
        { status: 400 },
      );
    }
    const expire = dayOf(row.expire_date);
    const movedExpire = !!prev && expire !== dayOf(prev.expire_date);
    if ((isNew || movedExpire) && expire && expire < todayStr()) {
      return NextResponse.json(
        { error: "วันหมดอายุย้อนหลังไม่ได้ — ต้องเป็นวันนี้หรือหลังจากนั้น" },
        { status: 400 },
      );
    }
    if (start && expire && expire < start) {
      return NextResponse.json({ error: "วันหมดอายุต้องไม่ก่อนวันที่เริ่มใช้" }, { status: 400 });
    }
    // ห้ามย้อนกลับไปใช้ราคาเก่า — ช่วงที่จะตั้งเป็น Active ต้องเริ่มวันนี้หรืออนาคตเท่านั้น
    const becomingActive = !!row.is_active && !prev?.is_active;
    if (becomingActive && start && start < todayStr()) {
      return NextResponse.json(
        { error: "กลับไปใช้ราคาของเดือนที่ผ่านมาไม่ได้ — ให้เพิ่มช่วงราคาใหม่ที่เริ่มวันนี้หรือหลังจากนั้น" },
        { status: 409 },
      );
    }
  }

  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    // ปลด active ทั้งหมดก่อน กัน unique index ชนกันระหว่างสลับช่วง
    await new sql.Request(tx).input("pid", sql.Int, packageId)
      .query(`UPDATE package_price_periods SET is_active=0 WHERE package_id=@pid`);

    for (const prev of existing) {
      if (!keepIds.has(prev.id)) {
        await new sql.Request(tx).input("id", sql.Int, prev.id)
          .query(`DELETE FROM package_price_periods WHERE id=@id`);
      }
    }

    for (const row of rows) {
      const bind = (r: sql.Request) => r
        .input("price", sql.Decimal(12, 2), Number(row.price) || 0)
        .input("inst", sql.NVarChar(20), text(row.monthly_installment))
        .input("saving", sql.Decimal(10, 2), num(row.monthly_saving))
        .input("start", sql.Date, toSqlDate(row.start_date ?? null))
        .input("expire", sql.Date, toSqlDate(row.expire_date ?? null))
        .input("act", sql.Bit, row.is_active ? 1 : 0)
        .input("note", sql.NVarChar(200), row.note === undefined && row.id ? (byId.get(Number(row.id))?.note ?? null) : text(row.note))
        .input("leads", sql.NVarChar(500), normalizeLeadIds(row.allowed_lead_ids));
      if (row.id && byId.has(Number(row.id))) {
        await bind(new sql.Request(tx).input("id", sql.Int, Number(row.id))).query(`
          UPDATE package_price_periods
          SET price=@price, monthly_installment=@inst, monthly_saving=@saving,
              start_date=@start, expire_date=@expire, is_active=@act, note=@note,
              allowed_lead_ids=@leads
          WHERE id=@id`);
      } else {
        await bind(new sql.Request(tx).input("pid", sql.Int, packageId).input("uid", sql.Int, gate.userId ?? null)).query(`
          INSERT package_price_periods(package_id, price, monthly_installment, monthly_saving, start_date, expire_date, is_active, note, created_by, allowed_lead_ids)
          VALUES(@pid, @price, @inst, @saving, @start, @expire, @act, @note, @uid, @leads)`);
      }
    }

    // รายการ Lead ผูกกับ "ชุดราคาของเดือนนั้น" ไม่ใช่ราย package — ตั้งที่ package ไหน
    // ก็มีผลกับทุก package ที่มีช่วงราคาเริ่มวันเดียวกัน (เช่นชุดราคาเดือน ก.ค. ทั้งชุด)
    for (const row of rows) {
      const start = dayOf(row.start_date);
      if (!start) continue;
      await new sql.Request(tx)
        .input("start", sql.Date, toSqlDate(row.start_date ?? null))
        .input("leads", sql.NVarChar(500), normalizeLeadIds(row.allowed_lead_ids))
        .query(`UPDATE package_price_periods SET allowed_lead_ids=@leads WHERE start_date=@start`);
    }

    // mirror ช่วงที่ active กลับไปที่ packages เพื่อให้โค้ดเดิมที่อ่าน packages.price ใช้ได้เหมือนเดิม
    await new sql.Request(tx).input("pid", sql.Int, packageId).query(`
      UPDATE p SET p.price = a.price, p.monthly_installment = a.monthly_installment,
                   p.monthly_saving = a.monthly_saving, p.start_date = a.start_date, p.expire_date = a.expire_date
      FROM packages p
      JOIN package_price_periods a ON a.package_id = p.id AND a.is_active = 1
      WHERE p.id = @pid`);

    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch { }
    console.error("PUT /api/packages/[id]/periods error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกช่วงราคาไม่สำเร็จ" }, { status: 500 });
  }

  await syncActivePricePeriods({ force: true });   // ช่วงที่ถึงวันแล้วให้ active ทันทีหลังบันทึก
  const after = await db.request().input("pid", sql.Int, packageId).query(`
    SELECT * FROM package_price_periods WHERE package_id=@pid
    ORDER BY ISNULL(start_date,'1900-01-01'), id`);
  return NextResponse.json(fixDates(after.recordset).map(row => ({ ...row, locked: isLocked(row as never) })));
}
