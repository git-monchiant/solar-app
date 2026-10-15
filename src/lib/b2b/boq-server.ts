import { sql } from "./db";
import { calcBoq, round2, type CalcLine } from "./boq-calc";
import { parseAddonModes, type BoqHeader, type BoqLine, type BoqRevision } from "./boq";
import type { B2bCategory } from "./materials";

// ฝั่ง server ของใบ BOQ — โหลดใบ + คำนวณยอดเก็บบนหัวใบ (ใช้ตัวคำนวณชุดเดียวกับหน้าจอ)

type Queryable = { request(): sql.Request };

const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadCategories(db: Queryable): Promise<B2bCategory[]> {
  const r = await db.request().query(`SELECT id, name, is_addon FROM b2b_categories ORDER BY sort_order, id`);
  return r.recordset.map((c) => ({ id: c.id, name: c.name, is_addon: !!c.is_addon }));
}

export async function loadBoq(db: Queryable, id: number): Promise<{ header: BoqHeader; lines: BoqLine[]; revisions: BoqRevision[] } | null> {
  const h = await db.request().input("id", sql.Int, id).query(`
    SELECT b.*, cu.full_name AS created_by_name, uu.full_name AS updated_by_name, pj.code AS project_code, pj.stage AS project_stage,
           (SELECT TOP 1 CONCAT(q.doc_no, ' Rev ', q.revision) FROM b2b_quotations q
            WHERE q.boq_id = b.id AND q.status NOT IN ('draft', 'changes_required') ORDER BY q.id DESC) AS locked_by_quote
    FROM b2b_boqs b
    LEFT JOIN b2b_projects pj ON pj.id = b.project_id
    LEFT JOIN users cu ON cu.id = b.created_by
    LEFT JOIN users uu ON uu.id = b.updated_by
    WHERE b.id = @id`);
  const row = h.recordset[0];
  if (!row) return null;
  const header: BoqHeader = {
    id: row.id, doc_no: row.doc_no, revision: row.revision, is_latest: !!row.is_latest,
    project_id: row.project_id ?? null, project_code: row.project_code ?? null, option_label: row.option_label ?? null,
    locked_by_quote: row.locked_by_quote ?? null, project_stage: row.project_stage ?? null,
    project_name: row.project_name, customer_name: row.customer_name, location: row.location,
    latitude: num(row.latitude), longitude: num(row.longitude), margin_pct: Number(row.margin_pct), vat_pct: Number(row.vat_pct),
    addon_modes: parseAddonModes(row.addon_modes), note: row.note,
    capacity_wp: num(row.capacity_wp), total_cost: num(row.total_cost), total_sale: num(row.total_sale), pending_lines: row.pending_lines,
    created_at: row.created_at, created_by_name: row.created_by_name, updated_at: row.updated_at, updated_by_name: row.updated_by_name,
  };
  const root = row.root_id ?? row.id;
  const [items, revs] = await Promise.all([
    db.request().input("id", sql.Int, id).query(`
      SELECT i.*, m.unit_price AS current_unit_price, m.is_active AS current_active, pu.full_name AS price_entered_by_name
      FROM b2b_boq_items i
      LEFT JOIN b2b_materials m ON m.id = i.material_id
      LEFT JOIN users pu ON pu.id = i.price_entered_by
      WHERE i.boq_id = @id
      ORDER BY i.category_id, i.sort_order, i.id`),
    db.request().input("root", sql.Int, root).query(`
      SELECT id, revision, is_latest, updated_at FROM b2b_boqs WHERE id = @root OR root_id = @root ORDER BY revision`),
  ]);
  const lines: BoqLine[] = items.recordset.map((i) => ({
    id: i.id, key: `l${i.id}`, category_id: i.category_id, line_type: i.line_type, material_id: i.material_id,
    subgroup: i.subgroup, name: i.name, brand: i.brand, model: i.model, unit: i.unit, spec_watt: num(i.spec_watt),
    price_basis: i.price_basis, unit_cost: num(i.unit_cost), qty: Number(i.qty), note: i.note,
    price_entered_by_name: i.price_entered_by_name,
    current_unit_price: i.material_id ? num(i.current_unit_price) : null,
    current_active: i.material_id ? !!i.current_active : undefined,
  }));
  return { header, lines, revisions: revs.recordset.map((r) => ({ id: r.id, revision: r.revision, is_latest: !!r.is_latest, updated_at: r.updated_at })) };
}

/** ยอดที่เก็บบนหัวใบ (หน้ารายการใช้แสดง) — คำนวณจากบรรทัดที่บันทึกจริง */
export async function storeTotals(db: Queryable, id: number): Promise<void> {
  // ทีละคำสั่ง — ถูกเรียกใน transaction ซึ่ง mssql ยิงหลาย request พร้อมกันบน connection เดียวไม่ได้
  const cats = await loadCategories(db);
  const h = await db.request().input("id", sql.Int, id).query(`SELECT margin_pct, vat_pct, addon_modes FROM b2b_boqs WHERE id = @id`);
  const items = await db.request().input("id", sql.Int, id).query(`SELECT id, category_id, price_basis, unit_cost, qty, spec_watt FROM b2b_boq_items WHERE boq_id = @id`);
  const head = h.recordset[0];
  const lines: CalcLine[] = items.recordset.map((i) => ({
    key: String(i.id), category_id: i.category_id, price_basis: i.price_basis, unit_cost: num(i.unit_cost), qty: Number(i.qty), spec_watt: num(i.spec_watt),
  }));
  const r = calcBoq({ lines, categories: cats, margin_pct: Number(head.margin_pct), vat_pct: Number(head.vat_pct), addon_modes: parseAddonModes(head.addon_modes) });
  await db.request().input("id", sql.Int, id)
    .input("cap", sql.Decimal(14, 2), round2(r.capacity_wp))
    .input("cost", sql.Decimal(16, 2), round2(r.subtotal.cost))
    .input("sale", sql.Decimal(16, 2), round2(r.subtotal.sale))
    .input("pending", sql.Int, r.pending_lines)
    .query(`UPDATE b2b_boqs SET capacity_wp = @cap, total_cost = @cost, total_sale = @sale, pending_lines = @pending WHERE id = @id`);
}

/** เลขที่ใบ BOQyymm-nnn (เวลาไทย) — เรียกใน transaction · UPDLOCK กันสองคนได้เลขซ้ำ */
export async function nextDocNo(tx: sql.Transaction): Promise<string> {
  const now = new Date(Date.now() + 7 * 3600 * 1000);   // Asia/Bangkok
  const prefix = `BOQ${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  const r = await new sql.Request(tx).input("p", sql.NVarChar(30), `${prefix}%`)
    .query(`SELECT MAX(doc_no) AS last FROM b2b_boqs WITH (UPDLOCK, HOLDLOCK) WHERE doc_no LIKE @p`);
  const last = r.recordset[0]?.last as string | null;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}
