import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { resolveServiceType } from "@/lib/om/entitlement";

// แก้สิทธิ์รายบ้าน — เดิมมีแต่ล้างแผง ตั้งแต่ 9 ก.ย. 69 ระบุประเภทงานได้ (เผื่อขายแพ็คตรวจเช็ก) — ข้อมูล import cutoff แค่ มิ.ย. 69
// แอดมินต้องเติมรายการล้างที่เกิดหลังจากนั้น · ปรับสิทธิ์ซื้อเพิ่ม/ต่อสัญญา/หมดอายุได้เอง
// ทุกการกระทำลง om_entitlement_history ในทรานแซกชันเดียวกัน

const GRANT_SOURCES = ["renewal", "purchase", "manual_adjust"];

async function logEnt(
  tx: sql.Transaction,
  v: { houseId: number; installationId: number | null; kind: string; action: string;
       refId: number | null; qty: number | null; detail: string; reason: string | null; actor: number | null },
) {
  await new sql.Request(tx)
    .input("h", sql.Int, v.houseId).input("i", sql.Int, v.installationId)
    .input("k", sql.NVarChar(12), v.kind).input("a", sql.NVarChar(12), v.action)
    .input("r", sql.Int, v.refId).input("q", sql.Int, v.qty)
    .input("d", sql.NVarChar(400), v.detail).input("rs", sql.NVarChar(300), v.reason)
    .input("u", sql.Int, v.actor)
    .query(`INSERT INTO om_entitlement_history
              (house_id, installation_id, kind, [action], ref_id, qty, detail, reason, actor_user_id)
            VALUES (@h, @i, @k, @a, @r, @q, @d, @rs, @u)`);
}

// ตรวจว่า installation อยู่ในบ้านหลังนี้จริง — กันยิงข้ามบ้าน
async function pickInstallation(db: sql.ConnectionPool, houseId: number, wanted?: number) {
  const r = await db.request().input("h", sql.Int, houseId)
    .query(`SELECT id FROM om_installations WHERE house_id = @h ORDER BY id`);
  const ids = r.recordset.map((x) => x.id as number);
  if (!ids.length) return null;
  if (wanted && !ids.includes(wanted)) return null;
  return wanted ?? ids[0];
}

// GET — ประวัติการแก้สิทธิ์ของบ้านหลังนี้
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const houseId = Number((await ctx.params).id);

  const db = await getOmDb();
  const r = await db.request().input("h", sql.Int, houseId).query(`
    SELECT TOP 50 eh.id, eh.kind, eh.[action], eh.qty, eh.detail, eh.reason,
           CONVERT(varchar(33), eh.created_at, 126) created_at, u.full_name actor_name
    FROM om_entitlement_history eh
    LEFT JOIN users u ON u.id = eh.actor_user_id
    WHERE eh.house_id = @h ORDER BY eh.id DESC`);
  return NextResponse.json({ history: r.recordset });
}

// POST — บันทึกการล้าง หรือปรับสิทธิ์
//   { kind: "redemption", service_date, note?, installation_id?, service_type_id? }
//   { kind: "grant", qty (+/-), source, reason?, installation_id?, service_type_id? }
//   ★ ไม่ส่ง service_type_id = ล้างแผง (ค่าเดิมของระบบ)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const houseId = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const instId = await pickInstallation(db, houseId, b.installation_id ? Number(b.installation_id) : undefined);
  if (!instId) return NextResponse.json({ error: "บ้านหลังนี้ยังไม่มีระบบติดตั้ง — เพิ่มสิทธิ์ไม่ได้" }, { status: 400 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    if (b.kind === "redemption") {
      const date = String(b.service_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("ต้องระบุวันที่ (YYYY-MM-DD)");
      const note = b.note ? String(b.note).slice(0, 300) : null;
      // ★ ตัดสิทธิ์ได้เฉพาะงานที่ตั้งไว้ว่า "กินสิทธิ์" — ชนิดที่ไม่กินสิทธิ์ไม่มีอะไรให้ตัด
      const type = await resolveServiceType(db, b.service_type_id);
      if (!type.consumes_quota)
        throw new Error(`งาน "${type.label_th}" ไม่ได้ตั้งค่าว่าใช้สิทธิ์ — ถ้าจะขายเป็นครั้ง ให้เปิด consumes_quota ก่อน`);
      const ins = await new sql.Request(tx)
        .input("i", sql.Int, instId).input("d", sql.Date, date)
        .input("t", sql.Int, type.id)
        .input("n", sql.NVarChar(300), note).input("u", sql.Int, gate.userId)
        .query(`INSERT INTO om_redemptions (installation_id, service_date, status, note, created_by, service_type_id)
                OUTPUT INSERTED.id VALUES (@i, @d, 'used', @n, @u, @t)`);
      const id = ins.recordset[0].id as number;
      await logEnt(tx, { houseId, installationId: instId, kind: "redemption", action: "add",
        refId: id, qty: -1, detail: `${type.label_th} วันที่ ${date}${note ? ` · ${note}` : ""}`, reason: note, actor: gate.userId });
      await tx.commit();
      return NextResponse.json({ ok: true, id });
    }

    if (b.kind === "grant") {
      const qty = Number(b.qty);
      if (!Number.isInteger(qty) || qty === 0) throw new Error("จำนวนต้องเป็นจำนวนเต็มและไม่เท่ากับ 0");
      if (Math.abs(qty) > 99) throw new Error("จำนวนต้องอยู่ระหว่าง -99 ถึง 99");
      const source = String(b.source ?? "manual_adjust");
      if (!GRANT_SOURCES.includes(source)) throw new Error("ประเภทสิทธิ์ไม่ถูกต้อง");
      const reason = b.reason ? String(b.reason).slice(0, 300) : null;
      // ★ สิทธิ์ผูกกับประเภทงาน — ขายแพ็คตรวจเช็ก 3 ครั้ง = grant qty 3 ของชนิด "ตรวจเช็กประจำปี"
      const type = await resolveServiceType(db, b.service_type_id);
      const ins = await new sql.Request(tx)
        .input("i", sql.Int, instId).input("q", sql.Int, qty)
        .input("s", sql.NVarChar(20), source).input("r", sql.NVarChar(300), reason)
        .input("t", sql.Int, type.id)
        .input("u", sql.Int, gate.userId)
        .query(`INSERT INTO om_entitlement_grants (installation_id, qty, source, reason, created_by, service_type_id)
                OUTPUT INSERTED.id VALUES (@i, @q, @s, @r, @u, @t)`);
      const id = ins.recordset[0].id as number;
      await logEnt(tx, { houseId, installationId: instId, kind: "grant", action: "add",
        refId: id, qty, detail: `${type.label_th} ${qty > 0 ? "+" : ""}${qty} · ${source}${reason ? ` · ${reason}` : ""}`,
        reason, actor: gate.userId });
      await tx.commit();
      return NextResponse.json({ ok: true, id });
    }

    throw new Error("kind ต้องเป็น redemption หรือ grant");
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}

// DELETE ?kind=grant|redemption&ref=<id> — ลบรายการที่บันทึกผิด (เก็บรายละเอียดไว้ใน history)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const houseId = Number((await ctx.params).id);
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const ref = Number(req.nextUrl.searchParams.get("ref"));
  if (!["grant", "redemption"].includes(kind) || !ref) {
    return NextResponse.json({ error: "ต้องระบุ kind และ ref" }, { status: 400 });
  }

  const db = await getOmDb();
  const table = kind === "grant" ? "om_entitlement_grants" : "om_redemptions";
  // ต้องเป็นแถวของบ้านหลังนี้เท่านั้น
  const cur = await db.request().input("r", sql.Int, ref).input("h", sql.Int, houseId).query(
    kind === "grant"
      ? `SELECT g.id, g.installation_id, g.qty, g.source, g.reason,
                ISNULL(st.label_th, N'ล้างแผง') service_type
         FROM om_entitlement_grants g JOIN om_installations i ON i.id = g.installation_id
         LEFT JOIN om_service_type st ON st.id = g.service_type_id
         WHERE g.id = @r AND i.house_id = @h`
      : `SELECT rd.id, rd.installation_id, CONVERT(char(10), rd.service_date, 23) service_date, rd.note,
                ISNULL(st.label_th, N'ล้างแผง') service_type
         FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
         LEFT JOIN om_service_type st ON st.id = rd.service_type_id
         WHERE rd.id = @r AND i.house_id = @h`);
  const row = cur.recordset[0];
  if (!row) return NextResponse.json({ error: "ไม่พบรายการในบ้านหลังนี้" }, { status: 404 });

  const detail = kind === "grant"
    ? `${row.service_type} ${row.qty > 0 ? "+" : ""}${row.qty} · ${row.source}${row.reason ? ` · ${row.reason}` : ""}`
    : `${row.service_type} วันที่ ${row.service_date}${row.note ? ` · ${row.note}` : ""}`;

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("r", sql.Int, ref).query(`DELETE FROM ${table} WHERE id = @r`);
    await logEnt(tx, { houseId, installationId: row.installation_id, kind, action: "remove",
      refId: ref, qty: kind === "grant" ? row.qty : -1, detail, reason: null, actor: gate.userId });
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
