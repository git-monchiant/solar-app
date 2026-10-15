import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_BOQ_VIEW_ROLES, B2B_BOQ_ROLES, readBoqHeader, readBoqLines } from "@/lib/b2b/boq";
import { loadBoq, loadCategories, storeTotals } from "@/lib/b2b/boq-server";
import { boqLockedByQuote } from "@/lib/b2b/quotation-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const db = await getB2bDb();
  const [boq, categories] = await Promise.all([loadBoq(db, id), loadCategories(db)]);
  if (!boq) return NextResponse.json({ error: "ไม่พบใบ BOQ" }, { status: 404 });
  return NextResponse.json({ ...boq, categories });
}

// บันทึกทั้งใบ (หัวใบ + บรรทัดทั้งชุด) — แก้ได้เฉพาะ Rev ล่าสุด
// ★ ราคาบรรทัด Master ไม่รับจากหน้าจอ: บรรทัดเดิมคง snapshot ไว้ (Purchase แก้ราคาทีหลังไม่ย้อนเปลี่ยนใบ)
//   ยกเว้น ① ขอ refresh_price ② บรรทัดที่ยังรอราคาแล้ว Purchase เพิ่งใส่ราคา (ไม่มีราคาเดิมให้รักษา)
//   บรรทัดใหม่ = ดึงจาก Master ตอนนี้ · ใส่ราคาเองได้เฉพาะหมวดเสริม 19–25 (readBoqLines ตรวจแล้ว)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const head = readBoqHeader(body.header ?? {});
  if ("error" in head) return NextResponse.json({ error: head.error }, { status: 400 });
  const lines = readBoqLines(body.lines);
  if ("error" in lines) return NextResponse.json({ error: lines.error }, { status: 400 });

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const cur = await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT is_latest, updated_at, project_id, doc_no FROM b2b_boqs WITH (UPDLOCK, ROWLOCK) WHERE id = @id`);
    const row = cur.recordset[0];
    if (!row) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบ BOQ" }, { status: 404 }); }
    if (!row.is_latest) { await tx.rollback(); return NextResponse.json({ error: "แก้ได้เฉพาะ Revision ล่าสุด" }, { status: 409 }); }
    // ใบเสนอราคาที่ส่งอนุมัติแล้วอ้าง Rev นี้ — ตัวเลขที่ผู้ตรวจสอบเห็นต้องไม่เปลี่ยนใต้มือ (แผน 20261015-07 เฟส 2)
    const lockedBy = await boqLockedByQuote(tx, id);
    if (lockedBy) { await tx.rollback(); return NextResponse.json({ error: `BOQ Rev นี้ใช้ในใบเสนอราคา ${lockedBy} ที่ส่งอนุมัติแล้ว — ออก Revision ใหม่ก่อนแก้` }, { status: 409 }); }
    if (body.expected_updated_at && new Date(body.expected_updated_at).getTime() !== new Date(row.updated_at).getTime()) {
      await tx.rollback();
      return NextResponse.json({ error: "มีคนบันทึกใบนี้ไปก่อนแล้ว — โหลดหน้าใหม่แล้วแก้อีกครั้ง" }, { status: 409 });
    }

    const oldRows = (await new sql.Request(tx).input("id", sql.Int, id).query(`SELECT * FROM b2b_boq_items WHERE boq_id = @id`)).recordset;
    const old = new Map(oldRows.map((r) => [r.id as number, r]));
    const matIds = [...new Set(lines.value.flatMap((l) => (l.kind === "material" ? [l.material_id] : [])))];
    const masters = new Map<number, Record<string, unknown>>();
    if (matIds.length) {
      const q = new sql.Request(tx);
      matIds.forEach((m, i) => q.input(`m${i}`, sql.Int, m));
      const r = await q.query(`SELECT * FROM b2b_materials WHERE id IN (${matIds.map((_, i) => `@m${i}`).join(",")})`);
      for (const m of r.recordset) masters.set(m.id, m);
    }

    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM b2b_boq_items WHERE boq_id = @id`);
    for (const [i, l] of lines.value.entries()) {
      const prev = l.id != null ? old.get(l.id) : undefined;
      let snap: Record<string, unknown>;
      let materialId: number | null = null;
      let enteredBy: number | null = null;
      if (l.kind === "material") {
        const mst = masters.get(l.material_id);
        if (!mst) throw new UserError(`บรรทัดที่ ${i + 1}: ไม่พบรายการใน Master`);
        materialId = l.material_id;
        const keep = prev && prev.line_type === "material" && prev.material_id === l.material_id && !l.refresh;
        if (keep) {
          snap = { ...prev };
          if (prev.unit_cost == null && mst.unit_price != null) snap.unit_cost = mst.unit_price;   // รอราคา → Purchase ใส่แล้ว
        } else {
          if (!mst.is_active && !prev) throw new UserError(`บรรทัดที่ ${i + 1}: "${mst.name}" ปิดใช้งานแล้ว เลือกใส่ใบใหม่ไม่ได้`);
          snap = { subgroup: mst.subgroup, name: mst.name, brand: mst.brand, model: mst.model, unit: mst.unit,
                   spec_watt: mst.spec_watt, price_basis: mst.price_basis, unit_cost: mst.unit_price };
        }
      } else {
        snap = { subgroup: null, name: l.name, brand: l.brand, model: l.model, unit: l.unit, spec_watt: null, price_basis: l.price_basis, unit_cost: l.unit_cost };
        const same = prev && prev.line_type === "manual" && Number(prev.unit_cost) === l.unit_cost && prev.price_basis === l.price_basis;
        enteredBy = same ? (prev.price_entered_by as number | null) : gate.userId;
      }
      await new sql.Request(tx)
        .input("boq", sql.Int, id).input("cat", sql.Int, l.category_id).input("sort", sql.Int, i)
        .input("type", sql.VarChar(10), l.kind).input("mat", sql.Int, materialId)
        .input("subgroup", sql.NVarChar(200), snap.subgroup ?? null).input("name", sql.NVarChar(300), snap.name)
        .input("brand", sql.NVarChar(150), snap.brand ?? null).input("model", sql.NVarChar(300), snap.model ?? null)
        .input("unit", sql.NVarChar(30), snap.unit).input("watt", sql.Decimal(10, 2), snap.spec_watt ?? null)
        .input("basis", sql.VarChar(20), snap.price_basis).input("cost", sql.Decimal(14, 4), snap.unit_cost ?? null)
        .input("qty", sql.Decimal(14, 3), l.qty).input("note", sql.NVarChar(500), l.note).input("by", sql.Int, enteredBy)
        .query(`INSERT INTO b2b_boq_items (boq_id, category_id, sort_order, line_type, material_id, subgroup, name, brand, model, unit,
                                           spec_watt, price_basis, unit_cost, qty, note, price_entered_by)
                VALUES (@boq, @cat, @sort, @type, @mat, @subgroup, @name, @brand, @model, @unit, @watt, @basis, @cost, @qty, @note, @by)`);
    }

    // ใบในโครงการ: ชื่อโครงการ/ลูกค้า/ที่ตั้งมาจากโครงการเสมอ (แก้ในหน้าโครงการ) — ไม่เชื่อค่าจากหน้าจอ
    const h = head.value;
    if (row.project_id) {
      const pj = (await new sql.Request(tx).input("p", sql.Int, row.project_id).query(`
        SELECT p.name, p.location, p.latitude, p.longitude, c.name AS customer_name
        FROM b2b_projects p JOIN b2b_customers c ON c.id = p.customer_id WHERE p.id = @p`)).recordset[0];
      if (pj) Object.assign(h, { project_name: pj.name, customer_name: pj.customer_name, location: pj.location,
        latitude: pj.latitude == null ? null : Number(pj.latitude), longitude: pj.longitude == null ? null : Number(pj.longitude) });
    }
    // ชื่อตัวเลือกใช้ร่วมทุก Rev ของเลขที่เดียวกัน
    await new sql.Request(tx).input("doc", sql.NVarChar(30), row.doc_no).input("label", sql.NVarChar(100), h.option_label)
      .query(`UPDATE b2b_boqs SET option_label = @label WHERE doc_no = @doc`);
    await new sql.Request(tx).input("id", sql.Int, id)
      .input("project", sql.NVarChar(300), h.project_name).input("customer", sql.NVarChar(300), h.customer_name)
      .input("location", sql.NVarChar(500), h.location).input("lat", sql.Decimal(9, 6), h.latitude).input("lng", sql.Decimal(9, 6), h.longitude)
      .input("margin", sql.Decimal(6, 3), h.margin_pct).input("note", sql.NVarChar(1000), h.note)
      .input("modes", sql.NVarChar(400), JSON.stringify(h.addon_modes)).input("u", sql.Int, gate.userId)
      .query(`UPDATE b2b_boqs SET project_name = @project, customer_name = @customer, location = @location, latitude = @lat, longitude = @lng,
                margin_pct = @margin, note = @note, addon_modes = @modes, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
    await storeTotals(tx, id);
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PUT /api/b2b/boqs/[id] error:", e);
    return NextResponse.json({ error: "บันทึกใบ BOQ ไม่สำเร็จ" }, { status: 500 });
  }
  const [boq, categories] = await Promise.all([loadBoq(db, id), loadCategories(db)]);
  return NextResponse.json({ ...boq, categories });
}

class UserError extends Error {}
