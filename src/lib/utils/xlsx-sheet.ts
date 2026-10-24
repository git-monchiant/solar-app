// xlsx-js-style — same fork the Lead Tracking export uses (writes cell styles).
import * as XLSX from "xlsx-js-style";

// ย้ายมาจาก /dashboard (Dashboard I) 15 ต.ค. 69 — ให้ภาพรวม O&M ใช้ตัวเดียวกัน (แผน 20261015-02)
//
// Both popup exports describe their sheet as a column spec, then hand it here.
// A column with nothing in it for this particular bucket is dropped instead of
// shipping an empty strip: the ยังไม่จอง list has no order yet, so six money
// columns and เหตุผลที่ยกเลิก would all be blank. `always` pins the few columns
// that identify a row even when they happen to be empty.
export type SheetCol<T> = { label: string; wch: number; always?: boolean; value: (row: T) => string | number };

export function sheetOf<T>(cols: SheetCol<T>[], rows: T[], sheetName: string) {
  const cells = rows.map(r => cols.map(c => c.value(r)));
  const used = cols.filter((c, i) => c.always || cells.some(row => row[i] !== ""));
  const keep = cols.map((c, i) => c.always || cells.some(row => row[i] !== ""));
  const aoa: (string | number)[][] = [
    used.map(c => c.label),
    ...cells.map(row => row.filter((_, i) => keep[i])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = used.map(c => ({ wch: c.wch }));
  // Frozen panes aren't in this library's writer — ws["!freeze"] silently did
  // nothing — so the header row gets filter dropdowns instead, which is what
  // the frozen row was meant to help with anyway.
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(used.length - 1, 0) } }) };
  used.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: "F3F4F6" } } };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

/** เขียนไฟล์ .xlsx ลงเครื่อง — ชื่อไฟล์ตัดอักขระที่ Excel ไม่รับ (\ / : * ? [ ]) ออก + วันที่ต่อท้าย */
export function downloadSheet<T>(cols: SheetCol<T>[], rows: T[], sheetName: string, title: string) {
  const safe = title.replace(/[\\/:*?[\]]/g, "-");
  XLSX.writeFile(sheetOf(cols, rows, sheetName), `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
