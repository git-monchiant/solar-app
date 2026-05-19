"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
// xlsx-js-style is a fork of xlsx that supports writing cell styles (community
// xlsx@0.18 reads styles but can't write them). API is otherwise compatible.
import * as XLSX from "xlsx-js-style";
import Header from "@/components/layout/Header";
import { STATUS_CONFIG, getMainStatus, getStatusLabel } from "@/lib/constants/statuses";
import { formatThaiDateShort } from "@/lib/utils/formatters";

interface Row {
  id: number;
  house_number: string | null;
  full_name: string;
  status: string;
  created_at: string | null;
  first_contact_at: string | null;
  first_contact_state: "yes" | "no" | null;
  contact2_at: string | null; contact2_state: "yes" | "no" | null;
  contact3_at: string | null; contact3_state: "yes" | "no" | null;
  contact4_at: string | null; contact4_state: "yes" | "no" | null;
  contact5_at: string | null; contact5_state: "yes" | "no" | null;
  sales_pitch_at: string | null;
  booking_paid_at: string | null;
  survey_date: string | null;
  survey_done_at: string | null;
  quote_issued_at: string | null;
  order_paid_at: string | null;
  install_date: string | null;
  install_started_at: string | null;
  install_done_at: string | null;
  warranty_at: string | null;
}

const STATE_KEY: Record<string, keyof Row | undefined> = {
  first_contact_at: "first_contact_state",
  contact2_at: "contact2_state",
  contact3_at: "contact3_state",
  contact4_at: "contact4_state",
  contact5_at: "contact5_state",
};

type ColKey = "created_at" | "first_contact_at" | "contact2_at" | "contact3_at" | "contact4_at" | "contact5_at"
  | "sales_pitch_at" | "booking_paid_at" | "survey_date" | "survey_done_at" | "quote_issued_at"
  | "order_paid_at" | "install_date" | "install_started_at" | "install_done_at" | "warranty_at";
type Tri = "any" | "yes" | "no";

const GROUPS: { title: string; tone: string; cols: { key: ColKey; label: string }[] }[] = [
  {
    title: "การติดต่อ",
    tone: "bg-sky-50 text-sky-800 border-sky-200",
    cols: [
      { key: "first_contact_at", label: "ครั้งที่ 1" },
      { key: "contact2_at", label: "ครั้งที่ 2" },
      { key: "contact3_at", label: "ครั้งที่ 3" },
      { key: "contact4_at", label: "ครั้งที่ 4" },
      { key: "contact5_at", label: "ครั้งที่ 5" },
      { key: "sales_pitch_at", label: "เสนอขาย" },
    ],
  },
  {
    title: "Pre-Survey / Survey",
    tone: "bg-violet-50 text-violet-800 border-violet-200",
    cols: [
      { key: "booking_paid_at", label: "จองสำรวจ" },
      { key: "survey_date", label: "นัดสำรวจ" },
      { key: "survey_done_at", label: "สำรวจเสร็จ" },
    ],
  },
  {
    title: "Quote / Order",
    tone: "bg-orange-50 text-orange-800 border-orange-200",
    cols: [
      { key: "quote_issued_at", label: "ออกใบเสนอราคา" },
      { key: "order_paid_at", label: "จ่ายมัดจำ/ทั้งหมด" },
    ],
  },
  {
    title: "ติดตั้ง / รับประกัน",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    cols: [
      { key: "install_date", label: "นัดติดตั้ง" },
      { key: "install_started_at", label: "เริ่มติดตั้ง" },
      { key: "install_done_at", label: "ติดตั้งเสร็จ" },
      { key: "warranty_at", label: "ออกใบรับประกัน" },
    ],
  },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pre_survey", label: "Pre-Survey" },
  { value: "survey",     label: "สำรวจ" },
  { value: "quote",      label: "ใบเสนอราคา" },
  { value: "order",      label: "Order" },
  { value: "install",    label: "ติดตั้ง" },
  { value: "warranty",   label: "รับประกัน" },
  { value: "gridtie",    label: "ขนานไฟ" },
  { value: "closed",     label: "ส่งมอบ" },
  { value: "lost",       label: "ยกเลิก" },
  { value: "returned",   label: "ส่งกลับ" },
];

const ALL_COLS: ColKey[] = ["created_at", "first_contact_at",
  "contact2_at", "contact3_at", "contact4_at", "contact5_at",
  "sales_pitch_at", "booking_paid_at",
  "survey_date", "survey_done_at", "quote_issued_at", "order_paid_at",
  "install_date", "install_started_at", "install_done_at", "warranty_at"];

const emptyTri = (): Record<ColKey, Tri> => Object.fromEntries(ALL_COLS.map(k => [k, "any"])) as Record<ColKey, Tri>;

export default function LifecyclePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tri, setTri] = useState<Record<ColKey, Tri>>(emptyTri());

  useEffect(() => {
    apiFetch("/api/lifecycle")
      .then((d: Row[]) => setRows(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter(r =>
        (r.full_name || "").toLowerCase().includes(needle)
        || (r.house_number || "").toLowerCase().includes(needle)
        || String(r.id) === q.trim()
      );
    }
    if (statusSel.size > 0) {
      out = out.filter(r => statusSel.has(getMainStatus(r.status)));
    }
    if (from) out = out.filter(r => r.created_at && r.created_at.slice(0, 10) >= from);
    if (to)   out = out.filter(r => r.created_at && r.created_at.slice(0, 10) <= to);
    for (const k of ALL_COLS) {
      const t = tri[k];
      if (t === "yes") out = out.filter(r => !!r[k]);
      else if (t === "no") out = out.filter(r => !r[k]);
    }
    return out;
  }, [rows, q, statusSel, from, to, tri]);

  const toggleStatus = (v: string) => {
    setStatusSel(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const cycleTri = (k: ColKey) => {
    setTri(prev => ({ ...prev, [k]: prev[k] === "any" ? "yes" : prev[k] === "yes" ? "no" : "any" }));
  };

  const hasActiveFilters = q || statusSel.size > 0 || from || to || ALL_COLS.some(k => tri[k] !== "any");
  const clearAll = () => { setQ(""); setStatusSel(new Set()); setFrom(""); setTo(""); setTri(emptyTri()); };

  // Export the currently filtered rows to .xlsx. Date cells get a ✓/✗ prefix so
  // the contact outcome is visible in Excel without us emitting a second column
  // per milestone.
  const exportExcel = () => {
    // Full DD/MM/YYYY (Buddhist Era) for the spreadsheet — easier to sort and
    // filter in Excel than the abbreviated Thai short form shown on screen.
    const fmtDateFull = (s: string) => {
      const d = new Date(s);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear() + 543;
      return `${dd}/${mm}/${yyyy}`;
    };
    // Each milestone cell carries its value AND its outcome state so we can
    // colour the date text green/red in Excel rather than prefixing with ✓/✗.
    type CellInfo = { v: string; state?: "yes" | "no" | null };
    const fmt = (date: string | null, state?: "yes" | "no" | null): CellInfo => {
      if (!date || state === null) return { v: "" };
      // Plain milestones (no explicit state passed) are treated as success — a
      // date that exists means the milestone happened.
      return { v: fmtDateFull(date), state: state ?? "yes" };
    };

    // Two-row header: groups (merged) on top, columns below — mirrors the
    // on-screen matrix so the spreadsheet reads the same way.
    const groupSpec: { title: string; cols: number }[] = [
      { title: "ลีด", cols: 5 },
      { title: "การติดต่อ", cols: 6 },
      { title: "Pre-Survey / Survey", cols: 3 },
      { title: "Quote / Order", cols: 2 },
      { title: "ติดตั้ง / รับประกัน", cols: 4 },
    ];
    const totalCols = groupSpec.reduce((s, g) => s + g.cols, 0);
    const groupRow: string[] = [];
    for (const g of groupSpec) {
      groupRow.push(g.title);
      for (let i = 1; i < g.cols; i++) groupRow.push("");
    }
    const colRow = [
      "#", "บ้านเลขที่", "ชื่อ", "สถานะ", "วันสร้าง",
      "ครั้งที่ 1", "ครั้งที่ 2", "ครั้งที่ 3", "ครั้งที่ 4", "ครั้งที่ 5", "เสนอขาย",
      "จองสำรวจ", "นัดสำรวจ", "สำรวจเสร็จ",
      "ออกใบเสนอราคา", "จ่ายมัดจำ/ทั้งหมด",
      "นัดติดตั้ง", "เริ่มติดตั้ง", "ติดตั้งเสร็จ", "ออกใบรับประกัน",
    ];
    const dataCells: (CellInfo | { v: string | number })[][] = filtered.map((r, i) => [
      { v: i + 1 },
      { v: r.house_number ?? "" },
      { v: r.full_name },
      { v: getStatusLabel({ status: r.status, install_date: r.install_date }) },
      (() => {
        const c = fmt(r.created_at);
        const a = agingDays(r.created_at);
        return c.v && a != null ? { ...c, v: `${c.v}\n(Aging: ${a})` } : c;
      })(),
      fmt(r.first_contact_at, r.first_contact_state),
      fmt(r.contact2_at, r.contact2_state),
      fmt(r.contact3_at, r.contact3_state),
      fmt(r.contact4_at, r.contact4_state),
      fmt(r.contact5_at, r.contact5_state),
      fmt(r.sales_pitch_at),
      fmt(r.booking_paid_at),
      fmt(r.survey_date),
      fmt(r.survey_done_at),
      fmt(r.quote_issued_at),
      fmt(r.order_paid_at),
      fmt(r.install_date),
      fmt(r.install_started_at),
      fmt(r.install_done_at),
      fmt(r.warranty_at),
    ]);
    const dataRows = dataCells.map(row => row.map(c => c.v));
    const ws = XLSX.utils.aoa_to_sheet([groupRow, colRow, ...dataRows]);

    // Merge each group's row-0 cells so the group title spans its columns.
    const merges: XLSX.Range[] = [];
    let col = 0;
    for (const g of groupSpec) {
      if (g.cols > 1) merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + g.cols - 1 } });
      col += g.cols;
    }
    ws["!merges"] = merges;

    // Style palette echoes the reference screenshot — saturated gold for the
    // group row, lighter cream for the column row, thin borders throughout.
    const thin = { style: "thin", color: { rgb: "B8861B" } };
    const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
    const groupStyle = {
      fill: { fgColor: { rgb: "C8893C" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, sz: 11 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: allBorders,
    };
    const colHeaderStyle = {
      fill: { fgColor: { rgb: "F4E4B7" } },
      font: { color: { rgb: "5B3A0E" }, bold: true, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: allBorders,
    };
    const hairBorders = {
      top: { style: "hair", color: { rgb: "D0D0D0" } },
      bottom: { style: "hair", color: { rgb: "D0D0D0" } },
      left: { style: "hair", color: { rgb: "D0D0D0" } },
      right: { style: "hair", color: { rgb: "D0D0D0" } },
    };

    for (let c = 0; c < totalCols; c++) {
      const a = XLSX.utils.encode_cell({ r: 0, c });
      const b = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[a]) ws[a].s = groupStyle;
      if (ws[b]) ws[b].s = colHeaderStyle;
    }
    // Each data cell gets its own font colour: green when the milestone was
    // hit successfully, red when contact failed, default grey otherwise.
    for (let r = 0; r < dataCells.length; r++) {
      const row = dataCells[r];
      for (let c = 0; c < row.length; c++) {
        const info = row[c] as CellInfo;
        const ref = XLSX.utils.encode_cell({ r: r + 2, c });
        const cell = ws[ref];
        if (!cell) continue;
        const color =
          info.state === "no"  ? { rgb: "C0392B" } :
          info.state === "yes" ? { rgb: "1E8449" } :
          undefined;
        cell.s = {
          font: { sz: 10, ...(color ? { color, bold: true } : {}) },
          alignment: { vertical: "center", wrapText: true },
          border: hairBorders,
        };
      }
    }

    ws["!cols"] = [
      { wch: 4 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 20 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    ];
    ws["!rows"] = [{ hpt: 24 }, { hpt: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lifecycle");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `lifecycle_${today}.xlsx`);
  };


  const StatusPill = ({ lead }: { lead: Row }) => {
    const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG[getMainStatus(lead.status)] ?? STATUS_CONFIG.pre_survey;
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded text-xxs whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
        {getStatusLabel({ status: lead.status, install_date: lead.install_date })}
      </span>
    );
  };

  // Compact D/M format ("8/5") — full date in title tooltip so admin can hover
  // for the precise timestamp without losing horizontal space.
  const shortDate = (s: string) => {
    const d = new Date(s);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const Cell = ({ date, state = "yes" }: { date: string | null; state?: "yes" | "no" | null }) => {
    if (!date || state === null) return <span className="text-gray-300 text-xxs">—</span>;
    if (state === "no") {
      return (
        <span title={formatThaiDateShort(date)} className="inline-flex items-center gap-0.5 text-xxs text-red-700 tabular-nums whitespace-nowrap">
          <svg className="w-3 h-3 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {shortDate(date)}
        </span>
      );
    }
    return (
      <span title={formatThaiDateShort(date)} className="inline-flex items-center gap-0.5 text-xxs text-emerald-700 tabular-nums whitespace-nowrap">
        <svg className="w-3 h-3 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {shortDate(date)}
      </span>
    );
  };

  // Inline tri-state indicator for the milestone column header.
  const TriBadge = ({ state }: { state: Tri }) => {
    if (state === "any") return null;
    return (
      <span className={`ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[8px] font-bold ${state === "yes" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
        {state === "yes" ? "✓" : "✗"}
      </span>
    );
  };

  const flatCols = GROUPS.flatMap(g => g.cols);
  const groupEnds = new Set<number>();
  { let acc = 0; for (let i = 0; i < GROUPS.length - 1; i++) { acc += GROUPS[i].cols.length; groupEnds.add(acc - 1); } }

  // Days since lead was created. Floors at zero (a future-dated row would
  // otherwise render as a negative aging).
  const agingDays = (createdAt: string | null) => {
    if (!createdAt) return null;
    const ms = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  };

  return (
    <>
      <Header title="Lead Tracking" />
      <div className="px-3 sm:px-6 py-4">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="text-lg font-semibold">Lead Tracking</h1>
          <span className="text-xs text-gray-500">{filtered.length} / {rows.length} ลีด</span>
          {hasActiveFilters && (
            <button onClick={clearAll} className="text-xxs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">ล้าง filter</button>
          )}
          <button
            onClick={exportExcel}
            className="ml-auto text-xxs px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5"
            title={`Export ${filtered.length} rows to Excel`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Excel
          </button>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหา ชื่อ/id…"
            className="h-8 px-3 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Filter bar */}
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50/50 p-2 flex flex-wrap items-center gap-2">
          <span className="text-xxs text-gray-500 mr-1">สถานะ:</span>
          {STATUS_OPTIONS.map(s => {
            const cfg = STATUS_CONFIG[s.value];
            const on = statusSel.has(s.value);
            return (
              <button key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={`text-xxs px-2 py-0.5 rounded border transition-colors ${on
                  ? `${cfg?.bg ?? "bg-gray-200"} ${cfg?.text ?? "text-gray-700"} border-current`
                  : "bg-white text-gray-500 border-gray-300 hover:bg-gray-100"}`}>
                {s.label}
              </button>
            );
          })}
          <span className="text-xxs text-gray-500 mx-1 ml-3">วันสร้าง:</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="text-xxs h-7 px-1.5 border border-gray-300 rounded" />
          <span className="text-xxs text-gray-400">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="text-xxs h-7 px-1.5 border border-gray-300 rounded" />
          <span className="text-xxs text-gray-400 ml-2">(คลิกชื่อ milestone บนหัวคอลัมน์เพื่อกรอง มี / ไม่มี)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg bg-white">
            <table className="text-xxs table-fixed w-full">
              <colgroup>
                {/* Whitespace text nodes (including comments) inside <colgroup>
                    trigger a hydration error, so we keep all <col>s as direct
                    array children with no surrounding whitespace. */}
                {[
                  ["#", "w-8"], ["house", "w-16"], ["name", "w-28"], ["status", "w-20"], ["created", "w-16"],
                ].map(([k, cls]) => <col key={k} className={cls} />)}
                {flatCols.map(c => {
                  // Contact + Pre-Survey/Survey + install date cols are narrow —
                  // cells are either "—" or a short "✓ D/M" date.
                  const narrow = c.key === "first_contact_at"
                    || c.key === "contact2_at" || c.key === "contact3_at"
                    || c.key === "contact4_at" || c.key === "contact5_at"
                    || c.key === "sales_pitch_at"
                    || c.key === "booking_paid_at" || c.key === "survey_date" || c.key === "survey_done_at"
                    || c.key === "install_date" || c.key === "install_started_at" || c.key === "install_done_at";
                  // Long Thai labels need extra space — "ออกใบเสนอราคา",
                  // "จ่ายมัดจำ/ทั้งหมด", "ออกใบรับประกัน".
                  const wide = c.key === "quote_issued_at" || c.key === "order_paid_at" || c.key === "warranty_at";
                  return <col key={c.key} className={narrow ? "w-12" : wide ? "w-24" : "w-14"} />;
                })}
              </colgroup>
              <thead>
                {/* Group header row — sticky at top of scroll container */}
                <tr className="border-b border-gray-200">
                  <th colSpan={5} className="sticky top-16 z-20 bg-gray-50 px-2 py-1.5 text-left text-xxs font-semibold text-gray-700 border-r border-gray-200">ลีด</th>
                  {GROUPS.map(g => (
                    <th key={g.title} colSpan={g.cols.length} className={`sticky top-16 z-20 px-2 py-1.5 text-left text-xxs font-semibold border-r border-gray-200 ${g.tone}`}>
                      {g.title}
                    </th>
                  ))}
                </tr>
                {/* Column header row — sticks below group row */}
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-right font-medium">#</th>
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium">บ้านเลขที่</th>
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium">ชื่อ</th>
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium">สถานะ</th>
                  <th onClick={() => cycleTri("created_at")}
                      className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium border-r border-gray-200 cursor-pointer hover:bg-gray-100 select-none">
                    วันสร้าง<TriBadge state={tri.created_at} />
                  </th>
                  {flatCols.map((c, i) => (
                    <th key={c.key}
                        onClick={() => cycleTri(c.key)}
                        className={`sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium cursor-pointer hover:bg-gray-100 select-none truncate ${groupEnds.has(i) ? "border-r border-gray-200" : ""}`}>
                      {c.label}<TriBadge state={tri[c.key]} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-gray-700 truncate" title={r.house_number ?? ""}>{r.house_number || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 truncate" title={r.full_name}>
                      <a href={`/leads/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.full_name}</a>
                    </td>
                    <td className="px-2 py-1.5 truncate"><StatusPill lead={r} /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100">
                      <Cell date={r.created_at} />
                      {(() => {
                        const a = agingDays(r.created_at);
                        return a == null ? null : (
                          <span className="block text-[14px] text-gray-400 leading-tight">Aging: {a}</span>
                        );
                      })()}
                    </td>
                    {flatCols.map((c, i) => {
                      const stateField = STATE_KEY[c.key];
                      const state = stateField ? (r[stateField] as "yes" | "no" | null) : "yes";
                      return (
                        <td key={c.key} className={`px-2 py-1.5 ${groupEnds.has(i) ? "border-r border-gray-100" : ""}`}>
                          <Cell date={r[c.key]} state={state} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5 + flatCols.length} className="text-center py-8 text-gray-400">ไม่มีลีด</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
