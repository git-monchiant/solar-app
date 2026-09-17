import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { isCleaning } from "@/lib/om/entitlement";

// ลูกค้ารายคน — ดู · แก้ · ลบ (ตัดสิน hard/soft เองตามเงื่อนไขที่ผู้ใช้เคาะ 1 ก.ย.)

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);

  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT id, full_name, title, first_name, last_name, id_card, note, is_active,
           CONVERT(varchar(33), created_at, 126) created_at
    FROM om_customers WHERE id = @id;

    SELECT id, phone, is_primary FROM om_customer_phones WHERE customer_id = @id ORDER BY is_primary DESC, id;

    SELECT hc.id link_id, hc.role, hc.is_current, h.id house_id, h.house_number,
           ISNULL(pj.name_th, h.project_name) project_name, h.is_vip,
           (SELECT COUNT(*) FROM om_installations i WHERE i.house_id = h.id) system_count
    FROM om_house_customers hc
    JOIN om_houses h ON h.id = hc.house_id
    LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    WHERE hc.customer_id = @id ORDER BY hc.is_current DESC, hc.id;

    -- ★ "จำนวนครั้งที่ล้าง" ต้องนับเฉพาะใบของล้างแผง ไม่รวมสิทธิ์ชนิดอื่นที่ขายเป็นครั้ง
    SELECT COUNT(*) washes FROM om_redemptions rd
    JOIN om_installations i ON i.id = rd.installation_id
    JOIN om_house_customers hc ON hc.house_id = i.house_id
    WHERE hc.customer_id = @id AND rd.status <> 'void' AND ${isCleaning("rd")};

    SELECT COUNT(*) bookings FROM om_bookings b
    JOIN om_house_customers hc ON hc.house_id = b.house_id
    WHERE hc.customer_id = @id AND b.status IN ('NEW', 'CONFIRMED', 'IN_PROGRESS');

    SELECT TOP 30 [action], actor_user_id, from_json, to_json, reason,
           CONVERT(varchar(33), created_at, 126) created_at
    FROM om_customer_history WHERE customer_id = @id ORDER BY id DESC;`);

  // mssql พิมพ์ recordsets เป็น union — หลาย result set ต้อง cast เป็น array ก่อน index
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const cust = rs[0][0];
  if (!cust) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });

  return NextResponse.json({
    customer: fixDates([cust])[0],
    phones: rs[1],
    houses: rs[2],
    washes: rs[3][0].washes,
    active_bookings: rs[4][0].bookings,
    history: fixDates(rs[5]),
  });
}

// PATCH { title?, first_name?, last_name?, id_card?, note?, restore? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const cur = await db.request().input("id", sql.Int, id)
    .query(`SELECT full_name, title, first_name, last_name, id_card, note, is_active FROM om_customers WHERE id = @id`);
  const old = cur.recordset[0];
  if (!old) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });

  const title = b.title !== undefined ? (String(b.title).trim() || null) : old.title;
  const first = b.first_name !== undefined ? String(b.first_name).trim() : old.first_name;
  const last = b.last_name !== undefined ? (String(b.last_name).trim() || null) : old.last_name;
  if (!first) return NextResponse.json({ error: "ชื่อห้ามว่าง" }, { status: 400 });
  const full = [title, first, last].filter(Boolean).join(" ");
  const restore = b.restore === true;

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("id", sql.Int, id)
      .input("fn", sql.NVarChar(200), full)
      .input("t", sql.NVarChar(40), title).input("f", sql.NVarChar(120), first).input("l", sql.NVarChar(120), last)
      .input("card", sql.NVarChar(20), b.id_card !== undefined ? (String(b.id_card).trim() || null) : old.id_card)
      .input("nt", sql.NVarChar(sql.MAX), b.note !== undefined ? (String(b.note).trim() || null) : old.note)
      .input("act", sql.Bit, restore ? 1 : old.is_active)
      .query(`UPDATE om_customers SET full_name = @fn, title = @t, first_name = @f, last_name = @l,
                id_card = @card, note = @nt, is_active = @act, updated_at = SYSDATETIMEOFFSET()
              WHERE id = @id`);
    await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
      .input("act", sql.VarChar(20), restore ? "restore" : "update")
      .input("from", sql.NVarChar(sql.MAX), JSON.stringify({ full_name: old.full_name }))
      .input("to", sql.NVarChar(sql.MAX), JSON.stringify({ full_name: full }))
      .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, from_json, to_json)
              VALUES (@c, @act, @u, @from, @to)`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — ★ ตัดสินเอง (ผู้ใช้เคาะ 1 ก.ย.):
//   ไม่มีประวัติล้าง + ไม่มีนัดค้าง + ไม่ผูก LINE → ลบจริง (พร้อมเบอร์/การผูกบ้าน)
//   มีอย่างใดอย่างหนึ่ง → ซ่อน (is_active=0) กู้คืนได้ด้วย PATCH { restore: true }
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);

  const db = await getOmDb();
  const chk = await db.request().input("id", sql.Int, id).query(`
    SELECT
      -- ตัวนี้เป็นด่านกันลบ — นับ "ทุกชนิด" ไว้ก่อน ปลอดภัยกว่านับเฉพาะล้างแผง
      (SELECT COUNT(*) FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
       JOIN om_house_customers hc ON hc.house_id = i.house_id WHERE hc.customer_id = @id) washes,
      (SELECT COUNT(*) FROM om_bookings bk JOIN om_house_customers hc ON hc.house_id = bk.house_id
       WHERE hc.customer_id = @id) bookings,
      (SELECT COUNT(*) FROM om_customer_phones p JOIN om_line_users lu ON lu.phone = p.phone COLLATE Latin1_General_BIN2
       WHERE p.customer_id = @id) line_links,
      (SELECT COUNT(*) FROM om_customers WHERE id = @id) found`);
  const c = chk.recordset[0];
  if (!c.found) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });

  const locked = c.washes > 0 || c.bookings > 0 || c.line_links > 0;
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    if (locked) {
      await new sql.Request(tx).input("id", sql.Int, id)
        .query(`UPDATE om_customers SET is_active = 0, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
      await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
        .input("r", sql.NVarChar(300),
          `ซ่อนแทนการลบ — ล้าง ${c.washes} · นัด ${c.bookings} · LINE ${c.line_links}`)
        .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
                VALUES (@c, 'soft_delete', @u, @r)`);
    } else {
      // ลบจริง — เก็บ log ไว้ก่อนลบ (history อ้าง customer_id ที่หายไปได้ ไม่มี FK)
      await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
        .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
                VALUES (@c, 'hard_delete', @u, N'ไม่มีประวัติผูก ลบถาวร')`);
      await new sql.Request(tx).input("id", sql.Int, id).query(`
        -- primary_customer_id เป็น pointer เก่าจากตอน import — ล้างก่อน ไม่งั้นชน FK
        UPDATE om_houses SET primary_customer_id = NULL WHERE primary_customer_id = @id;
        DELETE FROM om_customer_phones WHERE customer_id = @id;
        DELETE FROM om_house_customers WHERE customer_id = @id;
        DELETE FROM om_customers WHERE id = @id;`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: locked ? "soft" : "hard" });
}
