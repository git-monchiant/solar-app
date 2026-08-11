"use client";
import { DownloadIcon, XIcon } from "@/components/ui/icons";

import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
// xlsx-js-style is a fork of xlsx that supports writing cell styles (community
// xlsx@0.18 reads styles but can't write them). API is otherwise compatible.
import * as XLSX from "xlsx-js-style";
import Header from "@/components/layout/Header";
import { STATUS_CONFIG, getMainStatus, getStatusLabel } from "@/lib/constants/statuses";
import { formatTHB, formatThaiDateShort } from "@/lib/utils/formatters";
import { LeadLink } from "@/components/lead/LeadLink";
import { getSourceStyle } from "@/lib/source-tag";
import { hasRole, useActiveRoles } from "@/lib/roles";

interface Row {
  id: number;
  house_number: string | null;
  full_name: string;
  source: string | null;
  status: string;
  customer_grade: string | null;
  customer_group: string | null;
  created_at: string | null;
  assigned_name: string | null;
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
  order_installments: string | null;
  order_paid_count: number | null;
  order_total: number | null;
  order_discount_amount: number | null;
  install_extra_cost: number | null;
  pre_total_price: number | null;
  payment_dates_json: string | null;
  payment_followup_date: string | null;
  install_date: string | null;
  install_started_at: string | null;
  install_done_at: string | null;
  warranty_at: string | null;
}

// Decode payment_dates_json into a flat list ordered by slot. Each entry is
// the amount + confirmed_at date for a slip_field. "pre_slip_url" sorts first
// as the booking/survey deposit; subsequent entries are installment 0, 1, 2, …
// in order.
function parsePaymentDates(json: string | null): Array<{ field: string; amount: number | null; confirmed_at: string }> {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{ slip_field: string; amount: number | null; confirmed_at: string }>;
    return arr.map(x => ({ field: x.slip_field, amount: x.amount ?? null, confirmed_at: x.confirmed_at }));
  } catch { return []; }
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
  | "order_paid_at" | "deposit_pct" | "payment_followup_date" | "install_date" | "install_started_at" | "install_done_at" | "warranty_at";

// % เงินมัดจำ — งวดแรกใน order_installments (down payment). null = ยังไม่มีแผนงวด.
function depositPct(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) {
      const p = Number(arr[0]?.pct);
      return Number.isFinite(p) ? Math.round(p) : null;
    }
  } catch { /* ignore */ }
  return null;
}

// "100,000 (20%)" — จำนวนเงินมัดจำ (order_total × pct) + เปอร์เซ็นต์. "" ถ้าไม่มีแผนงวด.
function depositDisplay(r: { order_installments: string | null; order_total: number | null }): string {
  const p = depositPct(r.order_installments);
  if (p == null) return "";
  const amt = r.order_total ? Math.round((r.order_total * p) / 100) : null;
  return amt != null ? `${formatTHB(amt)} (${p}%)` : `${p}%`;
}
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
      { key: "quote_issued_at", label: "ใบเสนอราคา" },
      { key: "order_paid_at", label: "ชำระมัดจำ" },
      { key: "deposit_pct", label: "% มัดจำ" },
      { key: "payment_followup_date", label: "นัดติดตามชำระ" },
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
  { value: "pre_survey", label: "รอติดตาม" },
  { value: "survey",     label: "สำรวจ" },
  { value: "quote",      label: "ใบเสนอราคา" },
  { value: "order",      label: "Order" },
  // Special — not a real status. Matches leads that have paid their deposit
  // (order_paid_at set), regardless of main status. Handled in the filter.
  { value: "deposit_paid", label: "จ่ายมัดจำ" },
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
  "payment_followup_date",
  "install_date", "install_started_at", "install_done_at", "warranty_at"];

const emptyTri = (): Record<ColKey, Tri> => Object.fromEntries(ALL_COLS.map(k => [k, "any"])) as Record<ColKey, Tri>;

function SourceCell({ source }: { source: string | null }) {
  if (!source) return <span className="text-gray-300">—</span>;
  const style = getSourceStyle(source);
  return (
    <span
      title={style.label}
      className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xxs whitespace-nowrap ring-1 ring-inset ${style.cls}`}
    >
      {style.label}
    </span>
  );
}

function TriBadge({ state }: { state: Tri }) {
  if (state === "any") return null;
  return (
    <span className={`ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[8px] font-bold ${state === "yes" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
      {state === "yes" ? "✓" : "✗"}
    </span>
  );
}

export default function LifecyclePage() {
  const { activeRoles } = useActiveRoles();
  const showSource = hasRole(activeRoles, "admin", "sales", "solar", "account");
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
      // "deposit_paid" is a virtual status — matches any lead with a deposit
      // payment date, OR'd with the real main-status selections.
      const wantDeposit = statusSel.has("deposit_paid");
      // "install" chip should also catch leads that *display* as รอติดตั้ง/
      // กำลังติดตั้ง but whose raw status is still "order" (deposit paid +
      // install_date set, before-install not yet 100%).
      const wantInstall = statusSel.has("install");
      out = out.filter(r =>
        statusSel.has(getMainStatus(r.status))
        || (wantDeposit && !!r.order_paid_at)
        || (wantInstall && r.status === "order" && (r.order_paid_count ?? 0) >= 1 && !!r.install_date)
      );
    }
    if (from) out = out.filter(r => r.created_at && r.created_at.slice(0, 10) >= from);
    if (to)   out = out.filter(r => r.created_at && r.created_at.slice(0, 10) <= to);
    for (const k of ALL_COLS) {
      const t = tri[k];
      // ALL_COLS only lists real date fields on Row; deposit_pct (a derived
      // column) is excluded, so the cast is safe.
      const val = (r: Row) => (r as unknown as Record<string, unknown>)[k];
      if (t === "yes") out = out.filter(r => !!val(r));
      else if (t === "no") out = out.filter(r => !val(r));
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

    // Parse per-lead payment list once so we can pull installment amounts when
    // rendering งวด 1-4 cells. The new layout is fixed-width (4 งวด max), no
    // need to pre-scan for the widest row.
    const paymentLists = filtered.map(r => parsePaymentDates(r.payment_dates_json));
    const MAX_INSTALLMENTS = 4;
    // Per-installment % pulled from order_installments JSON. Falls back to 0
    // when the lead hasn't planned that slot yet (the column still shows 0
    // instead of a blank per the user's "no value → 0" rule).
    const installmentPct = (raw: string | null, slot: number): number => {
      if (!raw) return 0;
      try {
        const arr = JSON.parse(raw) as Array<{ pct?: number }>;
        if (Array.isArray(arr) && arr[slot] && typeof arr[slot].pct === "number") {
          return Math.round(arr[slot].pct as number);
        }
      } catch { /* ignore */ }
      return 0;
    };
    // Quote/Order money columns — 11 fixed columns, no per-row variability.
    // (See dataCells for the exact mapping.) Group total = 2 quote/payment
    // workflow dates + 11 money + 1 followup date = 14.
    const groupSpec: { title: string; cols: number }[] = [
      { title: "ลีด", cols: showSource ? 10 : 9 }, // + ชื่อ Sales + ที่มา (ตาม Role) + Grade + กลุ่ม
      { title: "การติดต่อ", cols: 6 },
      { title: "Pre-Survey / Survey", cols: 3 },
      // Quote/Order = 2 workflow dates + 11 money + 5 payment dates (one
      // per slot: เงินจอง, งวด 1, 2, 3, 4) + 1 followup date = 19
      { title: "Quote / Order", cols: 19 },
      { title: "ติดตั้ง / รับประกัน", cols: 4 },
    ];
    const totalCols = groupSpec.reduce((s, g) => s + g.cols, 0);
    const groupRow: string[] = [];
    for (const g of groupSpec) {
      groupRow.push(g.title);
      for (let i = 1; i < g.cols; i++) groupRow.push("");
    }
    const colRow = [
      "#", "บ้านเลขที่", "ชื่อ",
      ...(showSource ? ["ที่มา"] : []),
      "ชื่อ Sales", "สถานะ", "Grade", "กลุ่ม", "วันสร้าง", "Aging",
      "ครั้งที่ 1", "ครั้งที่ 2", "ครั้งที่ 3", "ครั้งที่ 4", "ครั้งที่ 5", "เสนอขาย",
      "จองสำรวจ", "นัดสำรวจ", "สำรวจเสร็จ",
      "ออกใบเสนอราคา", "จ่ายมัดจำ/ทั้งหมด",
      // Money flow: เงินจอง+date → quote → installments (amount, %?, date) → totals
      "เงินจอง", "วันที่ชำระจอง", "มูลค่างาน", "ส่วนลด",
      "งวด 1 (มัดจำ)", "% งวด 1", "วันที่ชำระงวด 1",
      "งวด 2", "วันที่ชำระงวด 2",
      "งวด 3", "วันที่ชำระงวด 3",
      "งวด 4", "วันที่ชำระงวด 4",
      "รวมเงินรับตามใบเสนอราคา", "เงินจ่ายเพิ่ม", "ยอดรวม",
      "นัดติดตามชำระ",
      "นัดติดตั้ง", "เริ่มติดตั้ง", "ติดตั้งเสร็จ", "ออกใบรับประกัน",
    ];
    const dataCells: (CellInfo | { v: string | number })[][] = filtered.map((r, i) => {
      const payments = paymentLists[i];
      const bookingPay = payments.find(p => p.field === "pre_slip_url");
      const installmentPays = payments.filter(p => p.field !== "pre_slip_url");
      // เงินจอง uses the booked amount (pre_total_price) per spec — different
      // from what the customer actually paid when partial.
      const deposit = r.pre_total_price ?? 0;
      const bookingDate = bookingPay?.confirmed_at ?? null;
      // งวด 1-4: amount + paid date come from the confirmed payment row (what
      // actually arrived). Missing slot → 0 amount + blank date per user spec.
      const installmentAmounts: number[] = [];
      const installmentDates: (string | null)[] = [];
      for (let j = 0; j < MAX_INSTALLMENTS; j++) {
        installmentAmounts.push(installmentPays[j]?.amount ?? 0);
        installmentDates.push(installmentPays[j]?.confirmed_at ?? null);
      }
      const installmentPct1 = installmentPct(r.order_installments, 0);
      // รวมเงินรับตามใบเสนอราคา = sum of installments (excludes เงินจอง)
      const installSum = installmentAmounts.reduce((s, n) => s + n, 0);
      const extraCost = r.install_extra_cost ?? 0;
      // ยอดรวม (grand) = เงินจอง + รวมเงินรับ + เงินจ่ายเพิ่ม
      const grandTotal = deposit + installSum + extraCost;
      return [
        { v: i + 1 },
        { v: r.house_number ?? "" },
        { v: r.full_name },
        ...(showSource ? [{ v: r.source ? getSourceStyle(r.source).label : "" }] : []),
        { v: r.assigned_name ?? "" },
        { v: getStatusLabel({ status: r.status, install_date: r.install_date }) },
        { v: r.customer_grade ?? "" },
        { v: r.customer_group ? (groupShort[r.customer_group]?.full ?? r.customer_group) : "" },
        fmt(r.created_at),
        (() => {
          const a = agingDays(r.created_at);
          return { v: a == null ? "" : `${a}d` };
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
        // — Quote/Order money + paid dates (16 cells) —
        { v: deposit },                                   // เงินจอง
        fmt(bookingDate),                                 // วันที่ชำระจอง
        { v: r.order_total ?? 0 },                        // มูลค่างาน
        { v: r.order_discount_amount ?? 0 },              // ส่วนลด
        { v: installmentAmounts[0] },                     // งวด 1 (มัดจำ)
        { v: installmentPct1 },                           // % งวด 1
        fmt(installmentDates[0]),                         // วันที่ชำระงวด 1
        { v: installmentAmounts[1] },                     // งวด 2
        fmt(installmentDates[1]),                         // วันที่ชำระงวด 2
        { v: installmentAmounts[2] },                     // งวด 3
        fmt(installmentDates[2]),                         // วันที่ชำระงวด 3
        { v: installmentAmounts[3] },                     // งวด 4
        fmt(installmentDates[3]),                         // วันที่ชำระงวด 4
        { v: installSum },                                // รวมเงินรับตามใบเสนอราคา
        { v: extraCost },                                 // เงินจ่ายเพิ่ม
        { v: grandTotal },                                // ยอดรวม
        fmt(r.payment_followup_date),                     // นัดติดตามชำระ
        fmt(r.install_date),
        fmt(r.install_started_at),
        fmt(r.install_done_at),
        fmt(r.warranty_at),
      ];
    });
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

    // Money column tints — each slot gets a distinct pastel; its paid-date
    // column inherits the same colour so reader can pair amount-with-date at
    // a glance even when scrolled. เงินจอง (peach) → installments (blue,
    // green, pink, peach) → รวม + grand (warm yellow).
    const moneyPalette: Record<string, string> = {
      "เงินจอง": "F8D8B8", "วันที่ชำระจอง": "F8D8B8",
      "งวด 1 (มัดจำ)": "C5D9F1", "% งวด 1": "C5D9F1", "วันที่ชำระงวด 1": "C5D9F1",
      "งวด 2": "D8E8C5", "วันที่ชำระงวด 2": "D8E8C5",
      "งวด 3": "E2C5E0", "วันที่ชำระงวด 3": "E2C5E0",
      "งวด 4": "F4D7C5", "วันที่ชำระงวด 4": "F4D7C5",
      "รวมเงินรับตามใบเสนอราคา": "F4E8B7",
      "ยอดรวม": "F4E8B7",
    };
    const colorByCol = new Map<number, string>();
    colRow.forEach((label, idx) => {
      const rgb = moneyPalette[label];
      if (rgb) colorByCol.set(idx, rgb);
    });
    const colHeaderStyleFor = (c: number) => {
      const rgb = colorByCol.get(c);
      return rgb ? { ...colHeaderStyle, fill: { fgColor: { rgb } } } : colHeaderStyle;
    };
    for (let c = 0; c < totalCols; c++) {
      const a = XLSX.utils.encode_cell({ r: 0, c });
      const b = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[a]) ws[a].s = groupStyle;
      if (ws[b]) ws[b].s = colHeaderStyleFor(c);
    }
    // Number formats: accounting on money columns, "0%" on the percent column —
    // both stay sortable/summable numbers (not text).
    const ACCT_FMT = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)';
    const PCT_FMT = '0"%"';
    const MONEY_LABELS = new Set([
      "เงินจอง", "มูลค่างาน", "ส่วนลด",
      "งวด 1 (มัดจำ)", "งวด 2", "งวด 3", "งวด 4",
      "รวมเงินรับตามใบเสนอราคา", "เงินจ่ายเพิ่ม", "ยอดรวม",
    ]);
    const moneyCols = new Set(colRow.map((l, i) => MONEY_LABELS.has(l) ? i : -1).filter(i => i >= 0));
    const pctCols = new Set(colRow.map((l, i) => l === "% งวด 1" ? i : -1).filter(i => i >= 0));

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
        // xlsx-js-style reads the number format from s.numFmt (cell.z alone is
        // ignored once a style object is attached).
        const numFmt = typeof cell.v === "number"
          ? (moneyCols.has(c) ? ACCT_FMT : pctCols.has(c) ? PCT_FMT : undefined)
          : undefined;
        cell.s = {
          font: { sz: 10, ...(color ? { color, bold: true } : {}) },
          alignment: { vertical: "center", wrapText: true },
          border: hairBorders,
          ...(numFmt ? { numFmt } : {}),
        };
        if (numFmt) cell.z = numFmt;
      }
    }

    // Widths track the column order:
    //   ลีด (9, or 10 when ที่มา is visible) | การติดต่อ (6) | Pre-Survey/Survey (3)
    //   | Quote/Order: 2 workflow dates + 16 money/paid-date + 1 followup = 19
    //   | ติดตั้ง/รับประกัน (4)
    ws["!cols"] = [
      // ลีด
      { wch: 4 }, { wch: 10 }, { wch: 24 },
      ...(showSource ? [{ wch: 28 }] : []),
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 16 },
      // การติดต่อ
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
      // Pre-Survey / Survey
      { wch: 14 }, { wch: 14 }, { wch: 14 },
      // Quote/Order workflow + money + followup
      { wch: 18 }, { wch: 20 },
      { wch: 12 }, { wch: 12 },                  // เงินจอง, วันที่ชำระจอง
      { wch: 14 }, { wch: 12 },                  // มูลค่างาน, ส่วนลด
      { wch: 14 }, { wch: 10 }, { wch: 12 },     // งวด 1, % งวด 1, วันที่ชำระงวด 1
      { wch: 14 }, { wch: 12 },                  // งวด 2 + date
      { wch: 14 }, { wch: 12 },                  // งวด 3 + date
      { wch: 14 }, { wch: 12 },                  // งวด 4 + date
      { wch: 20 }, { wch: 14 }, { wch: 14 },     // รวมเงินรับ, เงินจ่ายเพิ่ม, ยอดรวม
      { wch: 14 },                                // นัดติดตามชำระ
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    ];
    ws["!rows"] = [{ hpt: 24 }, { hpt: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lifecycle");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `lifecycle_${today}.xlsx`);
  };


  // Single-letter grade cell — color mirrors LeadCard's GRADE map so the
  // letter pops out against the dense lifecycle grid. Empty grade -> dash.
  const GradeCell = ({ grade }: { grade: string | null }) => {
    if (!grade) return <span className="text-gray-300">—</span>;
    const cMap: Record<string, string> = {
      A: "text-emerald-600", B: "text-sky-600", C: "text-amber-600",
      D: "text-orange-600", E: "text-gray-600",  F: "text-red-600",
    };
    return <span className={cMap[grade] || "text-gray-700"}>{grade}</span>;
  };

  // Short label for customer_group — table is tight on horizontal space so
  // use abbreviated forms (full names live in tooltip).
  const groupShort: Record<string, { short: string; full: string }> = {
    general: { short: "ทั่วไป", full: "ลูกค้าทั่วไป" },
    sena:    { short: "เสนา",   full: "ลูกค้าเสนา" },
    sme:     { short: "SME",    full: "SME (อาคารพาณิชย์/สำนักงาน/ร้านอาหาร)" },
  };
  const GroupCell = ({ group }: { group: string | null }) => {
    if (!group) return <span className="text-gray-300">—</span>;
    const g = groupShort[group];
    return <span title={g?.full ?? group} className="text-xxs text-gray-700 whitespace-nowrap">{g?.short ?? group}</span>;
  };

  const StatusPill = ({ lead }: { lead: Row }) => {
    const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG[getMainStatus(lead.status)] ?? STATUS_CONFIG.pre_survey;
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded text-xxs whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
        {getStatusLabel({ status: lead.status, install_date: lead.install_date, order_paid_count: lead.order_paid_count })}
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
          <XIcon className="w-3 h-3 text-red-600 shrink-0" strokeWidth={3} />
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
            <DownloadIcon className="w-3.5 h-3.5" strokeWidth={2} />
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
                  ["#", "w-8"], ["house", "w-16"], ["name", "w-28"],
                  ...(showSource ? [["source", "w-36"]] : []),
                  ["status", "w-20"], ["grade", "w-10"], ["group", "w-14"],
                  ["created", "w-14"], ["aging", "w-12"],
                ].map(([k, cls]) => <col key={k} className={cls} />)}
                {flatCols.map(c => {
                  // Contact group + install date cols are narrow — cells are
                  // either "—" or a short "✓ D/M" date.
                  const narrow = c.key === "first_contact_at"
                    || c.key === "contact2_at" || c.key === "contact3_at"
                    || c.key === "contact4_at" || c.key === "contact5_at"
                    || c.key === "sales_pitch_at"
                    || c.key === "install_date" || c.key === "install_started_at" || c.key === "install_done_at";
                  // Only "ออกใบรับประกัน" still needs extra space.
                  const wide = c.key === "warranty_at";
                  return <col key={c.key} className={narrow ? "w-12" : wide ? "w-24" : "w-16"} />;
                })}
              </colgroup>
              <thead>
                {/* Group header row — sticky at top of scroll container */}
                <tr className="border-b border-gray-200">
                  <th colSpan={8 + (showSource ? 1 : 0)} className="sticky top-16 z-20 bg-gray-50 px-2 py-1.5 text-left text-xxs font-semibold text-gray-700 border-r border-gray-200">ลีด</th>
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
                  {showSource && <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium">ที่มา</th>}
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium">สถานะ</th>
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-center font-medium">Grade</th>
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium">กลุ่ม</th>
                  <th onClick={() => cycleTri("created_at")}
                      className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium cursor-pointer hover:bg-gray-100 select-none">
                    วันสร้าง<TriBadge state={tri.created_at} />
                  </th>
                  <th className="sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium border-r border-gray-200">Aging</th>
                  {flatCols.map((c, i) => (
                    c.key === "deposit_pct" ? (
                      <th key={c.key}
                          className={`sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium select-none truncate ${groupEnds.has(i) ? "border-r border-gray-200" : ""}`}>
                        {c.label}
                      </th>
                    ) : (
                      <th key={c.key}
                          onClick={() => cycleTri(c.key)}
                          className={`sticky top-[100px] z-20 bg-gray-50 px-2 py-1.5 text-left font-medium cursor-pointer hover:bg-gray-100 select-none truncate ${groupEnds.has(i) ? "border-r border-gray-200" : ""}`}>
                        {c.label}<TriBadge state={tri[c.key]} />
                      </th>
                    )
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-gray-700 truncate" title={r.house_number ?? ""}>{r.house_number || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 truncate" title={r.full_name}>
                      <LeadLink id={r.id} className="text-primary hover:underline">{r.full_name}</LeadLink>
                    </td>
                    {showSource && <td className="px-2 py-1.5 overflow-hidden"><SourceCell source={r.source} /></td>}
                    <td className="px-2 py-1.5 truncate"><StatusPill lead={r} /></td>
                    <td className="px-2 py-1.5 text-center font-bold tabular-nums"><GradeCell grade={r.customer_grade} /></td>
                    <td className="px-2 py-1.5"><GroupCell group={r.customer_group} /></td>
                    <td className="px-2 py-1.5 whitespace-nowrap"><Cell date={r.created_at} /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100 whitespace-nowrap text-gray-500 tabular-nums">
                      {(() => {
                        const a = agingDays(r.created_at);
                        return a == null ? <span className="text-gray-300">—</span> : `${a}d`;
                      })()}
                    </td>
                    {flatCols.map((c, i) => {
                      if (c.key === "deposit_pct") {
                        const disp = depositDisplay(r);
                        return (
                          <td key={c.key} className={`px-2 py-1.5 tabular-nums whitespace-nowrap ${groupEnds.has(i) ? "border-r border-gray-100" : ""}`}>
                            {disp || <span className="text-gray-300">—</span>}
                          </td>
                        );
                      }
                      const stateField = STATE_KEY[c.key];
                      const state = stateField ? (r[stateField] as "yes" | "no" | null) : "yes";
                      return (
                        <td key={c.key} className={`px-2 py-1.5 ${groupEnds.has(i) ? "border-r border-gray-100" : ""}`}>
                          <Cell date={r[c.key as Exclude<ColKey, "deposit_pct">]} state={state} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8 + (showSource ? 1 : 0) + flatCols.length} className="text-center py-8 text-gray-400">ไม่มีลีด</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
