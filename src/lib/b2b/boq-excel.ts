import ExcelJS from "exceljs";
import { calcBoq, LABOR_CATEGORY, PCT_SALE_BASE_MAX_CATEGORY, perWp, type CalcResult } from "./boq-calc";
import type { BoqHeader, BoqLine } from "./boq";
import type { B2bCategory } from "./materials";

// ไฟล์ Excel ของใบ BOQ — ผังตาม sheet "EPCL - BOQS" ของไฟล์ทีม (หัวใบ → สรุป → ยอดรวม → รายละเอียดทีละหมวด)
// แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 4 (เคาะ: exceljs + ใส่สูตรง่ายให้ทีมแก้ตัวเลขใน Excel ต่อได้)
//   · ต้นทุนรวม = ปริมาณ × ต้นทุน · ราคาขาย = ต้นทุน ÷ (1 − Margin) อ้างช่อง Margin ช่องเดียว
//   · Capacity = Σ จำนวนแผง × W · ค่าแรงต่อ Wp อ้างช่อง Capacity · % อ้างฐานของตัวเอง
//   · ทุกสูตรใส่ค่าที่ calcBoq คิดไว้กำกับ (result) — โปรแกรมที่ไม่คำนวณสูตรใหม่ก็ยังเห็นตัวเลขถูก
// แก้จุดพลาดของไฟล์เดิมไว้ในสูตรด้วย: สูตรกำไรเดียว · Capacity ไม่ฝัง 730 · หมวดเสริมเข้ายอดครบ

const COLS = [
  { key: "A", width: 12 }, { key: "B", width: 46 }, { key: "C", width: 8 }, { key: "D", width: 16 }, { key: "E", width: 28 },
  { key: "F", width: 12 }, { key: "G", width: 9 }, { key: "H", width: 14 }, { key: "I", width: 17 }, { key: "J", width: 14 },
  { key: "K", width: 17 }, { key: "L", width: 9 },
];
const MONEY = "#,##0.00";
const PER_WP = "#,##0.00";
// เลขเต็มไม่มีจุดค้างท้าย ("266." ของ #,##0.###) — เลือก format ตามค่า
const qtyFmt = (n: number) => (Number.isInteger(n) ? "#,##0" : "#,##0.###");
const PCT = "0.00%";
const FILL = {
  head: "FFE5E7EB", cat: "FFDBEAFE", total: "FFF3F4F6", addon: "FFFEF3C7", grand: "FFE0E7FF", pending: "FFFEE2E2", sub: "FFF8FAFC",
};
const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };

/** สูตร SUM จากรายการแถว — รวบแถวติดกันเป็นช่วง · แบ่งก้อนละ 200 อาร์กิวเมนต์ (Excel รับได้ 255) */
function sumOf(col: string, rows: number[]): string {
  if (rows.length === 0) return "0";
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]; let prev = sorted[0];
  for (const r of [...sorted.slice(1), Infinity]) {
    if (r === prev + 1) { prev = r; continue; }
    parts.push(start === prev ? `${col}${start}` : `${col}${start}:${col}${prev}`);
    start = r; prev = r;
  }
  const chunks: string[] = [];
  for (let i = 0; i < parts.length; i += 200) chunks.push(`SUM(${parts.slice(i, i + 200).join(",")})`);
  return chunks.join("+");
}

export async function buildBoqWorkbook(input: { header: BoqHeader; lines: BoqLine[]; categories: B2bCategory[] }): Promise<{ buffer: Buffer; calc: CalcResult }> {
  const { header: h, lines, categories } = input;
  const calc = calcBoq({
    lines: lines.map((l) => ({ key: l.key, category_id: l.category_id, price_basis: l.price_basis, unit_cost: l.unit_cost, qty: l.qty, spec_watt: l.spec_watt })),
    categories, margin_pct: h.margin_pct, vat_pct: h.vat_pct, addon_modes: h.addon_modes,
  });
  const addonIds = [...new Set([...Object.keys(h.addon_modes).map(Number), ...lines.filter((l) => l.category_id >= 19).map((l) => l.category_id)])];
  const std = categories.filter((c) => !c.is_addon);
  const addons = categories.filter((c) => c.is_addon && addonIds.includes(c.id));
  const modeOf = (id: number) => calc.categories[id]?.mode ?? "included";
  const cap = calc.capacity_wp;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SENA Solar · Commercial (B2B)";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet("BOQ", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = COLS.map((c) => ({ key: c.key, width: c.width, style: { font: { name: "Tahoma", size: 10 } } }));

  type V = string | number | null | { formula: string; result: number };
  const set = (addr: string, v: V, numFmt?: string) => {
    const cell = ws.getCell(addr);
    cell.value = v as ExcelJS.CellValue;
    if (numFmt) cell.numFmt = numFmt;
    return cell;
  };
  const f = (formula: string, result: number) => ({ formula, result: Number.isFinite(result) ? result : 0 });
  const styleRow = (r: number, opts: { fill?: string; bold?: boolean; border?: boolean; from?: string; to?: string }) => {
    const from = (opts.from ?? "A").charCodeAt(0); const to = (opts.to ?? "L").charCodeAt(0);
    for (let c = from; c <= to; c++) {
      const cell = ws.getCell(`${String.fromCharCode(c)}${r}`);
      if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
      if (opts.bold) cell.font = { name: "Tahoma", size: 10, bold: true };
      if (opts.border) cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    }
  };

  // ── หัวใบ (แถว 1–5) ────────────────────────────────────────────────
  ws.mergeCells("A1:L1");
  set("A1", `BOQ(S) - ${h.project_name} (${(cap / 1000).toFixed(2)}kW)`).font = { name: "Tahoma", size: 14, bold: true };
  const label = (addr: string, text: string) => { set(addr, text).font = { name: "Tahoma", size: 10, bold: true }; };
  label("A2", "Project :"); set("B2", h.project_name); label("H2", "เลขที่ :"); set("I2", h.doc_no);
  label("A3", "Customer :"); set("B3", h.customer_name ?? ""); label("H3", "Rev :"); set("I3", h.revision);
  label("A4", "Capacity :"); label("C4", "Wp"); label("H4", "Date :"); set("I4", new Date(h.updated_at).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" }));
  label("A5", "Location :"); set("B5", h.location ?? "");
  if (h.latitude != null || h.longitude != null) { label("D5", "Lat, Long :"); set("E5", `${h.latitude ?? ""}, ${h.longitude ?? ""}`); }
  label("H5", "Margin :"); set("I5", h.margin_pct / 100, PCT).font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FF1D4ED8" } };
  label("H6", "VAT :"); set("I6", h.vat_pct / 100, PCT);
  // B4 (Capacity) ใส่สูตรหลังวางรายละเอียด — ต้องรู้แถวของบรรทัดแผงก่อน

  // ── จองแถวสรุป (แถว 8 เป็นต้นไป) ────────────────────────────────────
  const SUM_HEAD = 8;
  const sumRowOf = new Map<number, number>();
  let r = SUM_HEAD + 2;
  for (const c of std) sumRowOf.set(c.id, r++);
  let addonHeadRow = 0;
  if (addons.length) { addonHeadRow = r++; for (const c of addons) sumRowOf.set(c.id, r++); }
  const ROW = { material: r++, labor: r++, addon: addons.length ? r++ : 0, subtotal: r++, vat: r++, grand: r++, optional: calc.addon_optional.cost > 0 ? r++ : 0 };
  r += 2;

  // ── รายละเอียดทีละหมวด ───────────────────────────────────────────────
  const DET_HEAD = r;
  ["ลำดับ", "รายการ", "%", "ยี่ห้อ", "รุ่น / ขนาด", "ปริมาณ", "หน่วย", "ต้นทุน/หน่วย", "ต้นทุนรวม", "ขาย/หน่วย", "ราคาขายรวม", "%"]
    .forEach((t, i) => set(`${String.fromCharCode(65 + i)}${DET_HEAD}`, t));
  styleRow(DET_HEAD, { fill: FILL.head, bold: true, border: true });
  r = DET_HEAD + 1;

  const totalRowOf = new Map<number, number>();
  const lineRow = new Map<string, number>();
  const pctRows: { row: number; line: BoqLine }[] = [];
  const wattRows: { row: number; watt: number }[] = [];
  const baseRowsByCat = new Map<number, number[]>();
  const saleBaseRows: number[] = [];
  const SUBTOTAL_I = `$I$${ROW.subtotal}`;

  for (const c of [...std, ...addons]) {
    const optional = c.is_addon && modeOf(c.id) === "optional";
    if (c.id === addons[0]?.id) {
      ws.mergeCells(`A${r}:L${r}`);
      set(`A${r}`, "ส่วนเพิ่มเติมจากการเสนอราคาแบบมาตรฐาน (Optional Add-on Services)");
      styleRow(r, { fill: FILL.addon, bold: true }); r++;
    }
    set(`A${r}`, c.id); set(`B${r}`, `${c.name}${optional ? "  (ทางเลือก — ไม่รวมในยอด)" : ""}`);
    styleRow(r, { fill: FILL.cat, bold: true, border: true }); r++;
    const first = r;
    let n = 0; let lastSub: string | null = null;
    for (const l of lines.filter((x) => x.category_id === c.id)) {
      if (l.subgroup && l.subgroup !== lastSub) { set(`B${r}`, l.subgroup).font = { name: "Tahoma", size: 10, italic: true, color: { argb: "FF6B7280" } }; styleRow(r, { fill: FILL.sub }); r++; }
      lastSub = l.subgroup;
      const res = calc.lines[l.key];
      const pending = l.unit_cost == null;
      lineRow.set(l.key, r);
      set(`A${r}`, ++n);
      set(`B${r}`, `${l.name}${pending ? " (รอราคา)" : ""}`);
      set(`D${r}`, l.brand ?? "");
      set(`E${r}`, `${l.model ?? ""}${l.spec_watt ? `${l.model ? " · " : ""}${l.spec_watt} W` : ""}`);
      set(`G${r}`, l.price_basis === "system_wp" ? "Wp" : l.unit);
      if (l.price_basis === "system_wp") set(`F${r}`, f("$B$4", res.eff_qty), "#,##0");
      else set(`F${r}`, l.qty, qtyFmt(l.qty));
      if (l.price_basis === "watt") { set(`H${r}`, f(`${l.spec_watt ?? 0}*${l.unit_cost ?? 0}`, res.unit_cost), MONEY); wattRows.push({ row: r, watt: l.spec_watt ?? 0 }); }
      else if (l.price_basis === "pct_category" || l.price_basis === "pct_sale") { set(`C${r}`, (l.unit_cost ?? 0) / 100, PCT); pctRows.push({ row: r, line: l }); }
      else set(`H${r}`, pending ? null : l.unit_cost, MONEY);
      set(`I${r}`, f(`F${r}*H${r}`, res.cost), MONEY);
      set(`J${r}`, f(`H${r}/(1-$I$5)`, res.sale_unit), MONEY);
      set(`K${r}`, f(`F${r}*J${r}`, res.sale), MONEY);
      if (!optional) set(`L${r}`, f(`IF(${SUBTOTAL_I}=0,0,I${r}/${SUBTOTAL_I})`, res.share), PCT);
      styleRow(r, { border: true, fill: pending ? FILL.pending : undefined });
      if (l.price_basis !== "pct_category" && l.price_basis !== "pct_sale") {
        baseRowsByCat.set(c.id, [...(baseRowsByCat.get(c.id) ?? []), r]);
      }
      if (l.price_basis !== "pct_sale" && c.id <= PCT_SALE_BASE_MAX_CATEGORY && !c.is_addon) saleBaseRows.push(r);
      r++;
    }
    const last = r - 1;
    const tot = calc.categories[c.id];
    set(`A${r}`, `Total (${c.id}) ${c.name}`);
    set(`I${r}`, f(n ? `SUM(I${first}:I${last})` : "0", tot?.cost ?? 0), MONEY);
    set(`K${r}`, f(n ? `SUM(K${first}:K${last})` : "0", tot?.sale ?? 0), MONEY);
    styleRow(r, { fill: FILL.total, bold: true, border: true });
    totalRowOf.set(c.id, r); r += 2;
  }

  // % ของหมวด / % ของยอดขาย — ฐานอ้างแถวจริง (ไม่อ้างแถว Total กันสูตรวนกลับ)
  for (const { row, line } of pctRows) {
    const res = calc.lines[line.key];
    const base = line.price_basis === "pct_category" ? sumOf("I", baseRowsByCat.get(line.category_id) ?? []) : sumOf("K", saleBaseRows);
    set(`H${row}`, f(`C${row}*(${base})`, res.unit_cost), MONEY);
  }
  // Capacity = Σ จำนวนแผง × W (ไฟล์เดิมฝัง ×730 และนับแค่แถวแรก)
  set("B4", f(wattRows.length ? wattRows.map((w) => `F${w.row}*${w.watt}`).join("+") : "0", cap), "#,##0");

  // ── สรุป (เติมแถวที่จองไว้) ──────────────────────────────────────────
  ["ลำดับ", "รายการ"].forEach((t, i) => set(`${String.fromCharCode(65 + i)}${SUM_HEAD}`, t));
  ws.mergeCells(`H${SUM_HEAD}:I${SUM_HEAD}`); set(`H${SUM_HEAD}`, "ต้นทุน");
  ws.mergeCells(`J${SUM_HEAD}:K${SUM_HEAD}`); set(`J${SUM_HEAD}`, "ราคาขาย");
  set(`L${SUM_HEAD}`, "%");
  ["บาท/Wp", "บาท", "บาท/Wp", "บาท"].forEach((t, i) => set(`${"HIJK"[i]}${SUM_HEAD + 1}`, t));
  styleRow(SUM_HEAD, { fill: FILL.head, bold: true, border: true }); styleRow(SUM_HEAD + 1, { fill: FILL.head, bold: true, border: true });
  const perWpCell = (col: string, row: number, amount: number) => f(`IF($B$4=0,0,${col}${row}/$B$4)`, perWp(amount, cap));
  for (const c of [...std, ...addons]) {
    const row = sumRowOf.get(c.id)!; const tot = totalRowOf.get(c.id)!; const res = calc.categories[c.id];
    const optional = c.is_addon && modeOf(c.id) === "optional";
    set(`A${row}`, c.id); set(`B${row}`, `${c.name}${optional ? "  (ทางเลือก)" : ""}`);
    set(`I${row}`, f(`I${tot}`, res.cost), MONEY); set(`K${row}`, f(`K${tot}`, res.sale), MONEY);
    set(`H${row}`, perWpCell("I", row, res.cost), PER_WP); set(`J${row}`, perWpCell("K", row, res.sale), PER_WP);
    if (!optional) set(`L${row}`, f(`IF(${SUBTOTAL_I}=0,0,I${row}/${SUBTOTAL_I})`, res.share), PCT);
    styleRow(row, { border: true });
  }
  if (addonHeadRow) {
    ws.mergeCells(`A${addonHeadRow}:L${addonHeadRow}`);
    set(`A${addonHeadRow}`, "ส่วนเพิ่มเติมจากการเสนอราคาแบบมาตรฐาน (Optional Add-on Services)");
    styleRow(addonHeadRow, { fill: FILL.addon, bold: true });
  }
  const totalLine = (row: number, text: string, iF: string, kF: string, a: { cost: number; sale: number }, fill?: string) => {
    if (!row) return;
    set(`B${row}`, text);
    set(`I${row}`, f(iF, a.cost), MONEY); set(`K${row}`, f(kF, a.sale), MONEY);
    set(`H${row}`, perWpCell("I", row, a.cost), PER_WP); set(`J${row}`, perWpCell("K", row, a.sale), PER_WP);
    styleRow(row, { fill: fill ?? FILL.total, bold: true, border: true });
  };
  const rowsOf = (ids: number[]) => ids.map((id) => sumRowOf.get(id)!);
  const matIds = std.filter((c) => c.id !== LABOR_CATEGORY).map((c) => c.id);
  const inclIds = addons.filter((c) => modeOf(c.id) === "included").map((c) => c.id);
  const optIds = addons.filter((c) => modeOf(c.id) === "optional").map((c) => c.id);
  totalLine(ROW.material, "ราคาค่าวัสดุอุปกรณ์", sumOf("I", rowsOf(matIds)), sumOf("K", rowsOf(matIds)), calc.material);
  totalLine(ROW.labor, "ราคาค่าแรงติดตั้ง", `I${sumRowOf.get(LABOR_CATEGORY)}`, `K${sumRowOf.get(LABOR_CATEGORY)}`, calc.labor);
  totalLine(ROW.addon, "ส่วนเพิ่มเติมที่รวมในราคา", sumOf("I", rowsOf(inclIds)), sumOf("K", rowsOf(inclIds)), calc.addon_included);
  const parts = [ROW.material, ROW.labor, ROW.addon].filter(Boolean);
  totalLine(ROW.subtotal, "รวมเป็นเงิน (ก่อน VAT)", sumOf("I", parts), sumOf("K", parts), calc.subtotal, FILL.grand);
  totalLine(ROW.vat, `ภาษีมูลค่าเพิ่ม ${h.vat_pct}%`, `I${ROW.subtotal}*$I$6`, `K${ROW.subtotal}*$I$6`, calc.vat);
  totalLine(ROW.grand, "รวมเงินสุทธิ (Include VAT)", `I${ROW.subtotal}+I${ROW.vat}`, `K${ROW.subtotal}+K${ROW.vat}`, calc.grand, FILL.grand);
  totalLine(ROW.optional, "ราคาทางเลือก (ไม่รวมในยอด · ก่อน VAT)", sumOf("I", rowsOf(optIds)), sumOf("K", rowsOf(optIds)), calc.addon_optional, FILL.addon);
  ws.getCell(`B${ROW.subtotal + 0}`).font = { name: "Tahoma", size: 11, bold: true };
  ws.getCell(`K${ROW.grand}`).font = { name: "Tahoma", size: 11, bold: true };

  // ★ ห้ามใส่ state "frozen" โดยไม่มี xSplit/ySplit — exceljs เขียน <pane> เปล่า แล้ว Excel เปิดไฟล์ไม่ได้เลย (เจอตอนทดสอบเฟส 4)
  ws.views = [{ showGridLines: false }];
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, calc };
}

/** ชื่อไฟล์ดาวน์โหลด — ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ */
export function boqFileName(h: BoqHeader): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${h.doc_no}_Rev${h.revision}_${clean(h.project_name)}.xlsx`;
}
