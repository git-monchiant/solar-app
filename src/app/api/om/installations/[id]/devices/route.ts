import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAnyRole } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { logBooking } from "@/lib/om/booking-log";
import { DEVICE_KEYS, DEVICE_LABEL, DEVICE_TYPE, syncInstallationSpec, type DeviceKey } from "@/lib/om/devices";

// /api/om/installations/[id]/devices — Serial อุปกรณ์ของระบบติดตั้ง 1 ระบบ (แท็บ Equipment - Serial หน้างานบริการ)
// แผน docs/plan/20261021-03-om-equipment-serial-tab.md
// ★ รูปร่างเดียวกับ /api/leads/[id]/devices ให้ SerialsUploader ตัวเดิมใช้ได้ทั้งก้อน
//   GET → { inverters, batteries, panels, evidencePhotos } · PUT { type, items } แทนทั้งชนิด
// ★ ไม่มีล็อก/รูปหลักฐาน (ผู้ใช้เคาะ D1 = ก) — แก้ได้ตลอด ทุกการเพิ่ม/ลบจดลง Activity Log ของบ้าน
//   evidencePhotos ส่งว่างเสมอ (component อ่านคีย์นี้) · ไม่มี PATCH / DELETE
// ?booking=<id> = ใบงานที่เปิดอยู่ — ผูกแถว log กับใบนั้นด้วย (แบบปุ่ม Note)

const MAX_ITEMS = 500;
const PHOTO_URL = /^\/(?:api\/files|uploads)\/[A-Za-z0-9._-]+$/;

type Row = { id: number; brand: string | null; spec: number | null; serial_no: string | null;
  photo_url: string | null; photo_box: string | null; position: number; source: string;
  created_by: number | null; created_at: string; updated_at: string };

/** แถว DB → รูปร่างของฝั่งขาย (inverter = kw · battery = kwh · แผงไม่มีขนาด) */
function shape(key: DeviceKey, r: Row) {
  const base = { id: r.id, brand: r.brand, serial_no: r.serial_no, photo_url: r.photo_url, photo_box: r.photo_box,
    position: r.position, source: r.source, created_at: r.created_at, updated_at: r.updated_at };
  const spec = r.spec == null ? null : Number(r.spec);
  if (key === "inverters") return { ...base, kw: spec };
  if (key === "batteries") return { ...base, kwh: spec };
  return base;
}

async function readType(db: sql.ConnectionPool, instId: number, key: DeviceKey) {
  const r = await db.request().input("i", sql.Int, instId).input("t", sql.VarChar(10), DEVICE_TYPE[key])
    .query(`SELECT id, brand, spec, serial_no, photo_url, photo_box, position, source, created_by, created_at, updated_at
              FROM om_installation_devices WHERE installation_id = @i AND device_type = @t ORDER BY position, id`);
  return fixDates(r.recordset as Row[]).map((row) => shape(key, row as Row));
}

async function findInstallation(db: sql.ConnectionPool, id: number) {
  const r = await db.request().input("id", sql.Int, id)
    .query(`SELECT id, house_id FROM om_installations WHERE id = @id`);
  return r.recordset[0] as { id: number; house_id: number } | undefined;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบระบบติดตั้ง" }, { status: 404 });
  try {
    const db = await getOmDb();
    if (!(await findInstallation(db, id))) return NextResponse.json({ error: "ไม่พบระบบติดตั้ง" }, { status: 404 });
    const [inverters, batteries, panels] = await Promise.all(DEVICE_KEYS.map((k) => readType(db, id, k)));
    return NextResponse.json({ inverters, batteries, panels, evidencePhotos: { inverters: [], batteries: [], panels: [] } });
  } catch (e) {
    console.error("GET /api/om/installations/[id]/devices error:", e);
    return NextResponse.json({ error: "โหลดรายการ Serial ไม่สำเร็จ" }, { status: 500 });
  }
}

type InItem = { id?: unknown; brand?: unknown; kw?: unknown; kwh?: unknown; serial_no?: unknown; photo_url?: unknown; photo_box?: unknown };

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const specOf = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
};
const boxOf = (v: unknown) => {
  if (typeof v !== "string" || v.length > 50) return null;
  try {
    const a = JSON.parse(v) as unknown;
    return Array.isArray(a) && a.length === 4 && a.every((n) => typeof n === "number") ? v : null;
  } catch { return null; }
};
/** ข้อความ log ไม่เกิน 300 ตัวอักษร (ช่อง reason) — รายการ SN ยาวตัดท้ายเป็น "… อีก n" */
function listText(sns: string[], room: number) {
  let out = "";
  for (let i = 0; i < sns.length; i++) {
    const next = (out ? out + ", " : "") + sns[i];
    if (next.length > room) return `${out} … อีก ${sns.length - i}`;
    out = next;
  }
  return out;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบระบบติดตั้ง" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { type?: unknown; items?: unknown };
  const key = body.type as DeviceKey;
  if (!DEVICE_KEYS.includes(key)) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง" }, { status: 400 });
  }
  const raw = Array.isArray(body.items) ? (body.items as InItem[]) : [];
  if (raw.length > MAX_ITEMS) return NextResponse.json({ error: `บันทึกได้ไม่เกิน ${MAX_ITEMS} รายการ` }, { status: 400 });

  const items = raw.map((it) => ({
    id: Number(it?.id) || null,
    brand: text(it?.brand, 100),
    spec: key === "inverters" ? specOf(it?.kw) : key === "batteries" ? specOf(it?.kwh) : null,
    serial_no: text(it?.serial_no, 100),
    photo_url: typeof it?.photo_url === "string" && PHOTO_URL.test(it.photo_url) ? it.photo_url : null,
    photo_box: boxOf(it?.photo_box),
  }));
  // กัน Serial ซ้ำในชนิดเดียวกัน (หน้าจอกันแล้ว — กันอีกชั้นที่ API)
  const seen = new Set<string>();
  const dupes = items.map((x) => x.serial_no?.toLowerCase()).filter((s): s is string => {
    if (!s) return false;
    if (seen.has(s)) return true;
    seen.add(s);
    return false;
  });
  if (dupes.length) return NextResponse.json({ error: "พบ Serial ซ้ำ ไม่สามารถบันทึกได้", duplicateSerials: dupes }, { status: 409 });

  try {
    const db = await getOmDb();
    const inst = await findInstallation(db, id);
    if (!inst) return NextResponse.json({ error: "ไม่พบระบบติดตั้ง" }, { status: 404 });

    // ใบงานที่ส่งมาต้องเป็นของบ้านนี้ — กัน log ไปโผล่ในไทม์ไลน์ของบ้านอื่น (แบบ /api/om/houses/[id]/note)
    const bk = req.nextUrl.searchParams.get("booking");
    let bookingId: number | null = null;
    if (bk) {
      const row = (await db.request().input("b", sql.Int, Number(bk) || 0).input("h", sql.Int, inst.house_id)
        .query(`SELECT id FROM om_bookings WHERE id = @b AND house_id = @h`)).recordset[0];
      if (!row) return NextResponse.json({ error: "ใบงานนี้ไม่ใช่ของบ้านหลังนี้" }, { status: 400 });
      bookingId = row.id;
    }

    const type = DEVICE_TYPE[key];
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      // แถวเดิม — แถวที่ส่งกลับมาพร้อม id เดิมคงที่มา/คนเพิ่ม/เวลาเพิ่มไว้ (แทนทั้งชนิดแบบฝั่งขาย แต่ไม่ทำประวัติหาย)
      const before = (await new sql.Request(tx).input("i", sql.Int, id).input("t", sql.VarChar(10), type)
        .query(`SELECT id, serial_no, source, created_by, created_at FROM om_installation_devices WITH (UPDLOCK, HOLDLOCK)
                 WHERE installation_id = @i AND device_type = @t`)).recordset as
        { id: number; serial_no: string | null; source: string; created_by: number | null; created_at: Date }[];
      const prev = new Map(before.map((r) => [r.id, r]));

      await new sql.Request(tx).input("i", sql.Int, id).input("t", sql.VarChar(10), type)
        .query(`DELETE FROM om_installation_devices WHERE installation_id = @i AND device_type = @t`);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const old = it.id ? prev.get(it.id) : undefined;
        await new sql.Request(tx)
          .input("i", sql.Int, id).input("t", sql.VarChar(10), type)
          .input("brand", sql.NVarChar(100), it.brand)
          .input("spec", sql.Decimal(10, 3), it.spec)
          .input("sn", sql.NVarChar(200), it.serial_no)
          .input("url", sql.NVarChar(500), it.photo_url)
          .input("box", sql.NVarChar(50), it.photo_box)
          .input("pos", sql.Int, i)
          .input("src", sql.VarChar(10), old?.source ?? "manual")
          .input("by", sql.Int, old ? old.created_by : gate.userId ?? null)
          // แถวใหม่ใช้เวลาของ DB (นาฬิกาเครื่องแอปกับ DB ห่างกันได้หลายนาที)
          .input("at", sql.DateTimeOffset, old?.created_at ?? null)
          .query(`INSERT INTO om_installation_devices
                    (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source, created_by, created_at)
                  VALUES (@i, @t, @brand, @spec, @sn, @url, @box, @pos, @src, @by, ISNULL(@at, SYSDATETIMEOFFSET()))`);
      }

      if (key !== "panels") {
        await syncInstallationSpec(() => new sql.Request(tx), id,
          { kind: "manual", ref: "แท็บ Equipment - Serial", method: "แก้ในหน้างานบริการ", userId: gate.userId ?? null });
      }

      // Activity Log — บอกว่าเพิ่ม/ลบ SN ไหน (เทียบด้วย Serial ไม่สนตัวพิมพ์) · เรียงลำดับใหม่อย่างเดียวไม่จด
      const norm = (s: string | null) => (s ?? "").trim();
      const beforeSn = before.map((r) => norm(r.serial_no));
      const afterSn = items.map((x) => norm(x.serial_no));
      const lower = (a: string[]) => new Set(a.filter(Boolean).map((s) => s.toLowerCase()));
      const bSet = lower(beforeSn), aSet = lower(afterSn);
      const added = afterSn.filter((s) => s && !bSet.has(s.toLowerCase()));
      const removed = beforeSn.filter((s) => s && !aSet.has(s.toLowerCase()));
      // แถวไม่มี Serial (เช่นอินเวอร์เตอร์ที่ฝั่งขายกรอกแค่ยี่ห้อ) นับเป็นจำนวน
      const blankDiff = afterSn.filter((s) => !s).length - beforeSn.filter((s) => !s).length;
      const label = DEVICE_LABEL[key];
      const parts: string[] = [];
      if (items.length === 0 && before.length > 0) parts.push(`ลบทั้งหมด ${before.length} รายการ`);
      else {
        if (added.length) parts.push(`เพิ่ม ${added.length}: ${listText(added, 110)}`);
        if (removed.length) parts.push(`ลบ ${removed.length}: ${listText(removed, 110)}`);
        if (blankDiff > 0) parts.push(`เพิ่มแถวไม่มี Serial ${blankDiff}`);
        if (blankDiff < 0) parts.push(`ลบแถวไม่มี Serial ${-blankDiff}`);
      }
      if (parts.length) {
        await logBooking(tx, {
          houseId: inst.house_id, bookingId, action: "device", actorUserId: gate.userId ?? null,
          from: { type, installation_id: id, count: before.length, ...(removed.length ? { removed } : {}) },
          to: { type, installation_id: id, count: items.length, ...(added.length ? { added } : {}) },
          reason: `${label} · ${parts.join(" · ")}`.slice(0, 300),
        });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }

    return NextResponse.json({ items: await readType(db, id, key) });
  } catch (e) {
    console.error("PUT /api/om/installations/[id]/devices error:", e);
    return NextResponse.json({ error: "บันทึก Serial ไม่สำเร็จ" }, { status: 500 });
  }
}
