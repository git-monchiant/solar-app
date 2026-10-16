import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { resolveServiceType } from "@/lib/om/entitlement";

// แก้สิทธิ์รายบ้าน — เดิมมีแต่ล้างแผง ตั้งแต่ 9 ก.ย. 69 ระบุประเภทงานได้ (เผื่อขายแพ็คตรวจเช็ก) — ข้อมูล import cutoff แค่ มิ.ย. 69
// ปรับสิทธิ์ซื้อเพิ่ม/ต่อสัญญา/หมดอายุได้เอง · ★ การล้างไม่บันทึกที่นี่แล้ว (15 ต.ค. 69 — ผ่านการปิดงานในงานบริการเท่านั้น)
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

// POST — ปรับสิทธิ์ (เพิ่ม / ลด)
//   { kind: "grant", qty (+/-), source, reason?, installation_id?, service_type_id? }
//   ★ ไม่ส่ง service_type_id = ล้างแผง (ค่าเดิมของระบบ)
// ★ 15 ต.ค. 69 ผู้ใช้สั่งเอา "บันทึกล้างแผง" ออก (kind: "redemption") — ซ้ำกับการปิดงานในงานบริการ
//   ที่ตัดสิทธิ์ให้เองอยู่แล้ว (bookings/[id]) กดซ้ำแล้วบ้านโดนตัด 2 ครั้ง ⇒ ปฏิเสธทางนี้ที่ API ด้วย ไม่ใช่แค่ซ่อนปุ่ม
//   การล้างที่เกิดนอกระบบ / ช่วงข้อมูลขาด เติมด้วยการนำเข้า · ลบรายการล้างที่ผิด (DELETE) ยังทำได้
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const houseId = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  if (b.kind === "redemption")
    return NextResponse.json({ error: "บันทึกการล้างที่นี่ไม่ได้แล้ว — ปิดงานในงานบริการ ระบบตัดสิทธิ์ให้เอง" }, { status: 400 });

  const db = await getOmDb();
  const instId = await pickInstallation(db, houseId, b.installation_id ? Number(b.installation_id) : undefined);
  if (!instId) return NextResponse.json({ error: "บ้านหลังนี้ยังไม่มีระบบติดตั้ง — เพิ่มสิทธิ์ไม่ได้" }, { status: 400 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
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

    throw new Error("kind ต้องเป็น grant");
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}

// DELETE — ★ 15 ต.ค. 69 ผู้ใช้เคาะ "ตามแนะนำ": ลบรายการสิทธิ์/รายการล้างไม่ได้แล้ว (เอาปุ่ม × ออกจากหน้าบ้าน)
//   หลักเดียวกับบัญชี — บันทึกผิดให้เพิ่ม/ลดกลับพร้อมเหตุผล รายการเดิมกับรายการแก้อยู่ในลิสต์ทั้งคู่ เห็นว่าใครทำอะไร
//   ประวัติการลบก่อนหน้านี้ยังอยู่ใน om_entitlement_history (ไม่มีหน้าจอแสดง — ผู้ใช้สั่งเอาส่วนดูประวัติออก)
export async function DELETE(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  return NextResponse.json({ error: "ลบรายการไม่ได้ — ถ้าบันทึกผิด ให้เพิ่ม/ลดสิทธิ์กลับพร้อมระบุเหตุผล" }, { status: 405 });
}
