import ExcelJS from "exceljs";
import JSZip from "jszip";
import { calcBoq, LABOR_CATEGORY, PCT_SALE_BASE_MAX_CATEGORY, perWp, type CalcResult } from "./boq-calc";
import { wattInModel, type BoqHeader, type BoqLine } from "./boq";
import type { B2bCategory } from "./materials";

// ไฟล์ Excel ของใบ BOQ — ผังตาม sheet "EPCL - BOQS" ของไฟล์ทีม (หัวใบ → สรุป → ยอดรวม → รายละเอียดทีละหมวด)
// แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 4 (เคาะ: exceljs + ใส่สูตรง่ายให้ทีมแก้ตัวเลขใน Excel ต่อได้)
//   · ต้นทุนรวม = ROUND(ปริมาณ × ต้นทุน, 2) · ราคาขายรวม = ROUND(ต้นทุนรวม ÷ (1 − Margin), 2) อ้างช่อง Margin ช่องเดียว
//     VAT = ROUND(…, 2) — ปัดตำแหน่งเดียวกับ calcBoq ยอดรวมเลยบวกลงตัวและตรงกับหน้าจอ
//   · Capacity = Σ จำนวนแผง × W · ค่าแรงต่อ Wp อ้างช่อง Capacity · % อ้างฐานของตัวเอง
//   · ทุกสูตรใส่ค่าที่ calcBoq คิดไว้กำกับ (result) — โปรแกรมที่ไม่คำนวณสูตรใหม่ก็ยังเห็นตัวเลขถูก
// แก้จุดพลาดของไฟล์เดิมไว้ในสูตรด้วย: สูตรกำไรเดียว · Capacity ไม่ฝัง 730 · หมวดเสริมเข้ายอดครบ
// ต่างจากไฟล์เดิม (ผู้ใช้เคาะ 6 ต.ค. 69): ส่วนรายละเอียดข้ามหมวดที่ไม่มีรายการ (สรุปยังครบ 18 หมวด) · ศูนย์แสดง "-"
//   · รายละเอียดขึ้นหน้าใหม่ตอนพิมพ์ · ปิดสามเหลี่ยมเขียวของ Excel

const COLS = [
  { key: "A", width: 12 }, { key: "B", width: 46 }, { key: "C", width: 8 }, { key: "D", width: 16 }, { key: "E", width: 28 },
  { key: "F", width: 12 }, { key: "G", width: 9 }, { key: "H", width: 14 }, { key: "I", width: 17 }, { key: "J", width: 14 },
  { key: "K", width: 17 },
];
// ศูนย์ (หมวดว่าง / ยังไม่มีราคา) แสดง "-" · ค่าเล็กกว่าที่ 2 ตำแหน่งแสดงได้ขึ้น "<0.01" แบบหน้าจอ — ค่าจริงในช่องไม่เปลี่ยน
const MONEY = '#,##0.00;-#,##0.00;"-"';
const PER_WP = '[=0]"-";[<0.005]"<0.01";#,##0.00';
// เลขเต็มไม่มีจุดค้างท้าย ("266." ของ #,##0.###) — เลือก format ตามค่า
const qtyFmt = (n: number) => (Number.isInteger(n) ? "#,##0" : "#,##0.###");
const PCT = "0.00%";
const LEFT: Partial<ExcelJS.Alignment> = { horizontal: "left" };
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
const RIGHT: Partial<ExcelJS.Alignment> = { horizontal: "right", vertical: "middle" };
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

/** ปิดสามเหลี่ยมเขียวของ Excel — ผังนี้ตั้งใจให้แถวสรุปอ้างแถว Total คนละระยะ ("สูตรไม่เหมือนช่องข้างเคียง")
 *  และบรรทัดรอราคามีช่องราคาว่าง ("อ้างช่องว่าง") คนเปิดไฟล์จะนึกว่าผิด
 *  exceljs 4.4 เขียน <ignoredErrors> ไม่ได้ เลยแทรกเข้า sheet1.xml เอง — ตาม schema ต้องอยู่หลัง pageSetup/rowBreaks ก่อน drawing */
async function ignoreFormulaWarnings(buf: ArrayBuffer | Buffer, ref: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const path = "xl/worksheets/sheet1.xml";
  const xml = await zip.file(path)!.async("string");
  const tag = `<ignoredErrors><ignoredError sqref="${ref}" formula="1" formulaRange="1" emptyCellReference="1"/></ignoredErrors>`;
  const at = xml.search(/<(smartTags|drawing|legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
  zip.file(path, at >= 0 ? xml.slice(0, at) + tag + xml.slice(at) : xml.replace("</worksheet>", `${tag}</worksheet>`));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
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
    const from = (opts.from ?? "A").charCodeAt(0); const to = (opts.to ?? "K").charCodeAt(0);
    for (let c = from; c <= to; c++) {
      const cell = ws.getCell(`${String.fromCharCode(c)}${r}`);
      if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
      if (opts.bold) cell.font = { name: "Tahoma", size: 10, bold: true };
      if (opts.border) cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      // ทุกช่องกึ่งกลางแนวตั้ง — แถวสูงกว่าตัวหนังสือเมื่อไหร่ เลขลำดับ (กึ่งกลาง) กับช่องอื่น (ชิดล่าง) จะเหลื่อมกัน
      cell.alignment = { ...cell.alignment, vertical: "middle" };
    }
  };

  // ── หัวใบ (แถว 1–5) ────────────────────────────────────────────────
  ws.mergeCells("A1:K1");
  set("A1", `BOQ(S) - ${h.project_name} (${(cap / 1000).toFixed(2)} kWp)`).font = { name: "Tahoma", size: 14, bold: true };
  const label = (addr: string, text: string) => { set(addr, text).font = { name: "Tahoma", size: 10, bold: true }; };
  // ค่าในหัวใบชิดซ้ายทั้งหมด (ตัวเลข Rev / % / Capacity ปกติ Excel ชิดขวา จะลอยห่างจากหัวข้อ)
  label("A2", "Project :"); set("B2", h.project_name); label("H2", "เลขที่ :"); set("I2", h.doc_no);
  label("A3", "Customer :"); set("B3", h.customer_name ?? ""); label("H3", "Rev :"); set("I3", h.revision).alignment = LEFT;
  label("A4", "Capacity :"); label("H4", "Date :"); set("I4", new Date(h.updated_at).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" }));
  label("A5", "Location :"); set("B5", h.location ?? "");
  if (h.latitude != null || h.longitude != null) { label("D5", "Lat, Long :"); set("E5", `${h.latitude ?? ""}, ${h.longitude ?? ""}`); }
  label("H5", "Margin :"); const m = set("I5", h.margin_pct / 100, PCT); m.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FF1D4ED8" } }; m.alignment = LEFT;
  label("H6", "VAT :"); set("I6", h.vat_pct / 100, PCT).alignment = LEFT;
  // B4 (Capacity) ใส่สูตรหลังวางรายละเอียด — ต้องรู้แถวของบรรทัดแผงก่อน · หน่วย Wp อยู่ใน format ของช่อง

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
  ["ลำดับ", "รายการ", "%", "ยี่ห้อ", "รุ่น / ขนาด", "ปริมาณ", "หน่วย", "ต้นทุน/หน่วย", "ต้นทุนรวม", "ขาย/หน่วย", "ราคาขายรวม"]
    .forEach((t, i) => set(`${String.fromCharCode(65 + i)}${DET_HEAD}`, t));
  styleRow(DET_HEAD, { fill: FILL.head, bold: true, border: true });
  ws.getCell(`A${DET_HEAD}`).alignment = CENTER;
  for (const col of "CFHIJK") ws.getCell(`${col}${DET_HEAD}`).alignment = RIGHT;   // หัวคอลัมน์ตัวเลขชิดขวาตามตัวเลข
  // พิมพ์: รายละเอียดขึ้นหน้าใหม่ — หน้าแรกเป็นหัวใบ + สรุป
  // (พิมพ์หัวคอลัมน์ซ้ำทุกหน้าไม่ได้: Excel ตั้งแถวหัวซ้ำได้ชุดเดียวทั้งแผ่น จะไปโผล่บนหน้าสรุปด้วย)
  ws.getRow(DET_HEAD - 1).addPageBreak();
  r = DET_HEAD + 1;

  const totalRowOf = new Map<number, number>();
  const lineRow = new Map<string, number>();
  const pctRows: { row: number; line: BoqLine }[] = [];
  const wattRows: { row: number; watt: number }[] = [];
  const baseRowsByCat = new Map<number, number[]>();
  const saleBaseRows: number[] = [];

  // ข้ามหมวดที่ไม่มีรายการ — เดิมหมวดว่างกินหมวดละ 3 แถว (หัว + Total 0 + เว้น) จนหน้ารายละเอียดเป็นกล่องเปล่า
  // แถวสรุปของหมวดนั้นยังอยู่ ใส่ 0 แทนการอ้างแถว Total
  const detailCats = [...std, ...addons].filter((c) => lines.some((l) => l.category_id === c.id));
  let addonBand = false;
  for (const c of detailCats) {
    const optional = c.is_addon && modeOf(c.id) === "optional";
    if (c.is_addon && !addonBand) {
      addonBand = true;
      ws.mergeCells(`A${r}:K${r}`);
      set(`A${r}`, "ส่วนเพิ่มเติมจากการเสนอราคาแบบมาตรฐาน (Optional Add-on Services)");
      styleRow(r, { fill: FILL.addon, bold: true }); r++;
    }
    set(`A${r}`, c.id).alignment = CENTER; set(`B${r}`, `${c.name}${optional ? "  (ทางเลือก — ไม่รวมในยอด)" : ""}`);
    styleRow(r, { fill: FILL.cat, bold: true, border: true }); r++;
    const first = r;
    let n = 0; let lastSub: string | null = null;
    for (const l of lines.filter((x) => x.category_id === c.id)) {
      if (l.subgroup && l.subgroup !== lastSub) { set(`B${r}`, l.subgroup).font = { name: "Tahoma", size: 10, italic: true, color: { argb: "FF6B7280" } }; styleRow(r, { fill: FILL.sub }); r++; }
      lastSub = l.subgroup;
      const res = calc.lines[l.key];
      const pending = l.unit_cost == null;
      lineRow.set(l.key, r);
      set(`A${r}`, ++n).alignment = CENTER;
      set(`B${r}`, `${l.name}${pending ? " (รอราคา)" : ""}`);
      set(`D${r}`, l.brand ?? "");
      set(`E${r}`, `${l.model ?? ""}${l.spec_watt && !wattInModel(l.model, l.spec_watt) ? `${l.model ? " · " : ""}${l.spec_watt} W` : ""}`);
      set(`G${r}`, l.price_basis === "system_wp" ? "Wp" : l.unit);
      if (l.price_basis === "system_wp") set(`F${r}`, f("$B$4", res.eff_qty), "#,##0");
      else set(`F${r}`, l.qty, qtyFmt(l.qty));
      if (l.price_basis === "watt") { set(`H${r}`, f(`${l.spec_watt ?? 0}*${l.unit_cost ?? 0}`, res.unit_cost), MONEY); wattRows.push({ row: r, watt: l.spec_watt ?? 0 }); }
      else if (l.price_basis === "pct_category" || l.price_basis === "pct_sale") { set(`C${r}`, (l.unit_cost ?? 0) / 100, PCT); pctRows.push({ row: r, line: l }); }
      else set(`H${r}`, pending ? null : l.unit_cost, MONEY);
      set(`I${r}`, f(`ROUND(F${r}*H${r},2)`, res.cost), MONEY);
      set(`J${r}`, f(`H${r}/(1-$I$5)`, res.sale_unit), MONEY);
      set(`K${r}`, f(`ROUND(I${r}/(1-$I$5),2)`, res.sale), MONEY);
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
  set("B4", f(wattRows.length ? wattRows.map((w) => `F${w.row}*${w.watt}`).join("+") : "0", cap), '#,##0 "Wp"').alignment = LEFT;

  // ── สรุป (เติมแถวที่จองไว้) ──────────────────────────────────────────
  // ชื่อหมวดรวมช่อง B:G — คอลัมน์ C–G เป็นของส่วนรายละเอียด ถ้าไม่รวมจะเป็นช่องว่างตีเส้น 5 ช่องคั่นชื่อกับตัวเลข
  ws.mergeCells(`A${SUM_HEAD}:A${SUM_HEAD + 1}`); set(`A${SUM_HEAD}`, "ลำดับ");
  ws.mergeCells(`B${SUM_HEAD}:G${SUM_HEAD + 1}`); set(`B${SUM_HEAD}`, "รายการ");
  ws.mergeCells(`H${SUM_HEAD}:I${SUM_HEAD}`); set(`H${SUM_HEAD}`, "ต้นทุน");
  ws.mergeCells(`J${SUM_HEAD}:K${SUM_HEAD}`); set(`J${SUM_HEAD}`, "ราคาขาย");
  ["บาท/Wp", "บาท", "บาท/Wp", "บาท"].forEach((t, i) => set(`${"HIJK"[i]}${SUM_HEAD + 1}`, t));
  styleRow(SUM_HEAD, { fill: FILL.head, bold: true, border: true }); styleRow(SUM_HEAD + 1, { fill: FILL.head, bold: true, border: true });
  for (const a of ["A", "H", "J"]) ws.getCell(`${a}${SUM_HEAD}`).alignment = CENTER;
  ws.getCell(`B${SUM_HEAD}`).alignment = { horizontal: "left", vertical: "middle" };
  for (const a of "HIJK") ws.getCell(`${a}${SUM_HEAD + 1}`).alignment = RIGHT;
  const perWpCell = (col: string, row: number, amount: number) => f(`IF($B$4=0,0,${col}${row}/$B$4)`, perWp(amount, cap));
  for (const c of [...std, ...addons]) {
    const row = sumRowOf.get(c.id)!; const tot = totalRowOf.get(c.id); const res = calc.categories[c.id];
    const optional = c.is_addon && modeOf(c.id) === "optional";
    ws.mergeCells(`B${row}:G${row}`);
    set(`A${row}`, c.id).alignment = CENTER; set(`B${row}`, `${c.name}${optional ? "  (ทางเลือก)" : ""}`);
    // หมวดที่ไม่มีรายการไม่มีแถว Total ในส่วนรายละเอียด → 0 (แสดง "-")
    set(`I${row}`, tot ? f(`I${tot}`, res.cost) : 0, MONEY); set(`K${row}`, tot ? f(`K${tot}`, res.sale) : 0, MONEY);
    set(`H${row}`, perWpCell("I", row, res.cost), PER_WP); set(`J${row}`, perWpCell("K", row, res.sale), PER_WP);
    styleRow(row, { border: true });
  }
  if (addonHeadRow) {
    ws.mergeCells(`A${addonHeadRow}:K${addonHeadRow}`);
    set(`A${addonHeadRow}`, "ส่วนเพิ่มเติมจากการเสนอราคาแบบมาตรฐาน (Optional Add-on Services)");
    styleRow(addonHeadRow, { fill: FILL.addon, bold: true });
  }
  const totalLine = (row: number, text: string, iF: string, kF: string, a: { cost: number; sale: number }, fill?: string) => {
    if (!row) return;
    ws.mergeCells(`B${row}:G${row}`);
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
  totalLine(ROW.vat, `ภาษีมูลค่าเพิ่ม ${h.vat_pct}%`, `ROUND(I${ROW.subtotal}*$I$6,2)`, `ROUND(K${ROW.subtotal}*$I$6,2)`, calc.vat);
  totalLine(ROW.grand, "รวมเงินสุทธิ (Include VAT)", `I${ROW.subtotal}+I${ROW.vat}`, `K${ROW.subtotal}+K${ROW.vat}`, calc.grand, FILL.grand);
  totalLine(ROW.optional, "ราคาทางเลือก (ไม่รวมในยอด · ก่อน VAT)", sumOf("I", rowsOf(optIds)), sumOf("K", rowsOf(optIds)), calc.addon_optional, FILL.addon);
  ws.getCell(`B${ROW.subtotal + 0}`).font = { name: "Tahoma", size: 11, bold: true };
  ws.getCell(`K${ROW.grand}`).font = { name: "Tahoma", size: 11, bold: true };

  // ★ ห้ามใส่ state "frozen" โดยไม่มี xSplit/ySplit — exceljs เขียน <pane> เปล่า แล้ว Excel เปิดไฟล์ไม่ได้เลย (เจอตอนทดสอบเฟส 4)
  ws.views = [{ showGridLines: false }];
  const buffer = await ignoreFormulaWarnings(await wb.xlsx.writeBuffer(), `A1:K${ws.rowCount}`);
  return { buffer, calc };
}

/** ชื่อไฟล์ดาวน์โหลด — ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ */
export function boqFileName(h: BoqHeader): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${h.doc_no}_Rev${h.revision}_${clean(h.project_name)}.xlsx`;
}
