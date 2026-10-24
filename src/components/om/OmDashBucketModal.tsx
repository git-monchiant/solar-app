"use client";

// หน้าต่างรายชื่อหลังตัวเลขบนหน้าภาพรวม O&M (แผน 20261015-02)
// ★ ยก bucket popup ของ /dashboard (Dashboard I) ทั้งก้อน: หัว = ชื่อ (จำนวน) · Excel · ✕ · แถบสรุปเงิน · แถวกดเปิดแท็บใหม่
//   ต่างแค่เนื้อแถว (บ้าน/ใบงาน O&M) และโหลดรายชื่อตอนกดเปิด (บางตัวเลขเป็นพันหลัง ไม่โหลดรอทั้งหน้า)
import { useEffect, useState } from "react";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { DownloadIcon } from "@/components/ui/icons";
import { formatTHB } from "@/lib/utils/formatters";
import { downloadSheet, type SheetCol } from "@/lib/utils/xlsx-sheet";
import { BUCKET_LABEL, TONE } from "@/lib/om/service-view";
import { statusLabel, statusTone } from "@/lib/om/booking";

export type BucketKind = "tab" | "house" | "quota" | "washed" | "value";
export type BucketSpec = {
  title: string;
  kind: BucketKind;
  /** query ของ /api/om/dashboard/rows (ไม่รวม kind) */
  params: Record<string, string>;
};

type Row = {
  house_id: number; house_number: string | null; customer_name: string | null; phone: string | null; project_name: string | null;
  last_wash?: string | null; balance?: number;
  bucket?: string; booking_id?: number | null; job_status?: string | null;   // tab
  due?: number; never_washed?: number;                                          // house
  granted?: number; used?: number; left?: number;                               // quota
  service_date?: string;                                                         // washed
  doc_no?: string | null; package_name?: string | null; total?: number; received?: number; outstanding?: number;
  at?: string | null; paid_at?: string | null;                                   // value
};

const PAGE = 300;
/** PDF รวมใบบริการ — ชุดเดียวกับ MAX_DOCS ของ /api/om/jobs/docs */
const MAX_DOCS = 50;

/**
 * ปุ่ม "PDF รวม" — ใบบริการทุกใบในรายชื่อเป็นไฟล์เดียว (แผน 20261015-03 · ผู้ใช้เคาะ: แท็บปิดงานอย่างเดียว)
 * ★ API ตรวจสิทธิ์ด้วย header — fetch แล้วดาวน์โหลดเป็น blob (แบบปุ่ม PDF ของ Dashboard I)
 */
function BundlePdfButton({ ids, title }: { ids: number[]; title: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tooMany = ids.length > MAX_DOCS;
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const qs = new URLSearchParams({ ids: ids.join(","), title: `ใบบริการ O&M · ${title}` });
      const r = await fetch(`/api/om/jobs/docs?${qs}`, { headers: getUserContextHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "สร้าง PDF รวมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      const skipped = Number(r.headers.get("X-Om-Docs-Skipped") ?? 0);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `ใบบริการ_${title.replace(/[\\/:*?"<>|]/g, "-")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMsg({ ok: true, text: skipped
        ? `รวม ${Number(r.headers.get("X-Om-Docs-Included") ?? 0)} ใบ · ข้าม ${skipped} ใบที่ไม่มีใบตรวจรับงาน (ดูท้ายหน้าแรก)`
        : `รวม ${ids.length} ใบแล้ว` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };
  return (
    <span className="relative">
      <button type="button" onClick={run} disabled={busy || tooMany}
        title={tooMany ? `รวมได้ครั้งละไม่เกิน ${MAX_DOCS} ใบ` : `รวมใบบริการ ${ids.length} ใบเป็น PDF ไฟล์เดียว (หน้าแรกเป็นหน้าสรุปรายการ)`}
        className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
        {busy ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span>กำลังรวม {ids.length} ใบ…</span>
          </>
        ) : (
          <>
            <DownloadIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
            <span>PDF รวม</span>
          </>
        )}
      </button>
      {msg && (
        <span className={`absolute right-0 top-full mt-1 z-10 whitespace-nowrap rounded-md px-2 py-1 text-xxs shadow-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
const thDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
const fmtBaht = (v: number) => `฿${formatTHB(Math.round(v))}`;
const n = (v: number | undefined) => (v ?? 0).toLocaleString("th-TH");

/** กดแถวไปไหน — งานบริการของบ้าน (มีใบงาน/อยู่ในลิสต์) · หน้าบ้าน (ทะเบียน/สิทธิ์/ประวัติล้าง) */
const hrefOf = (kind: BucketKind, r: Row) =>
  kind === "tab" || kind === "value" ? `/om/services/${r.house_id}?focus=1` : `/om/houses?house=${r.house_id}`;

// คอลัมน์ Excel — ชุดเดียวกับที่หน้าต่างโชว์ + ส่วนที่หน้าต่างไม่มีที่วาง (เบอร์ · เงินแยกช่อง)
const BASE: SheetCol<Row>[] = [
  { label: "บ้านเลขที่", wch: 12, always: true, value: (r) => r.house_number ?? "" },
  { label: "ลูกค้า", wch: 28, always: true, value: (r) => r.customer_name ?? "" },
  { label: "เบอร์โทร", wch: 14, value: (r) => r.phone ?? "" },
  { label: "โครงการ", wch: 30, value: (r) => r.project_name ?? "" },
];
const COLS: Record<BucketKind, SheetCol<Row>[]> = {
  tab: [...BASE,
    { label: "แท็บ", wch: 14, value: (r) => BUCKET_LABEL[r.bucket ?? ""] ?? r.bucket ?? "" },
    { label: "สิทธิ์คงเหลือ", wch: 10, value: (r) => r.balance ?? "" },
    { label: "ล้างล่าสุด", wch: 12, value: (r) => thDate(r.last_wash) || "ยังไม่เคยล้าง" },
    { label: "ใบงาน", wch: 8, value: (r) => r.booking_id ?? "" }],
  house: [...BASE,
    { label: "รอบล้าง", wch: 12, value: (r) => (r.due ? "ถึงรอบ" : "ยังไม่ถึงรอบ") },
    { label: "สิทธิ์คงเหลือ", wch: 10, value: (r) => r.balance ?? "" },
    { label: "ล้างล่าสุด", wch: 12, value: (r) => thDate(r.last_wash) || "ยังไม่เคยล้าง" }],
  quota: [...BASE,
    { label: "ให้ไว้", wch: 8, value: (r) => r.granted ?? 0 },
    { label: "ใช้ไป", wch: 8, value: (r) => r.used ?? 0 },
    { label: "คงเหลือ", wch: 8, value: (r) => r.left ?? 0 }],
  washed: [{ label: "วันที่ล้าง", wch: 12, always: true, value: (r) => thDate(r.service_date) }, ...BASE,
    { label: "ใบงาน", wch: 8, value: (r) => r.booking_id ?? "" }],
  value: [{ label: "เลขใบเสนอราคา", wch: 20, always: true, value: (r) => r.doc_no ?? "" }, ...BASE,
    { label: "แพ็กเกจ", wch: 30, value: (r) => r.package_name ?? "" },
    { label: "สถานะใบงาน", wch: 12, value: (r) => (r.job_status ? statusLabel(r.job_status) : "") },
    { label: "วันที่ลูกค้ารับ", wch: 13, value: (r) => thDate(r.at) },
    { label: "มูลค่างาน", wch: 12, value: (r) => r.total ?? 0 },
    { label: "รับแล้ว", wch: 12, value: (r) => r.received ?? 0 },
    { label: "ยังค้างรับ", wch: 12, value: (r) => r.outstanding ?? 0 },
    { label: "วันที่รับเงิน", wch: 13, value: (r) => thDate(r.paid_at) }],
};

export default function OmDashBucketModal({ spec, onClose }: { spec: BucketSpec | null; onClose: () => void }) {
  // ผูกผลกับคีย์ของชุดที่เปิด — กดตัวเลขอื่นระหว่างโหลดแล้วรายชื่อเก่าไม่ค้างโผล่ในหน้าต่างใหม่
  const key = spec ? `kind=${spec.kind}&${new URLSearchParams(spec.params)}` : "";
  const [data, setData] = useState<{ key: string; rows: Row[] | null; err: string } | null>(null);
  // จำนวนแถวที่วาดอยู่ — ผูกกับคีย์เหมือนกัน เปิดชุดใหม่แล้วเริ่มที่ PAGE แถวเสมอ
  const [more, setMore] = useState<{ key: string; n: number }>({ key: "", n: PAGE });
  const shown = more.key === key ? more.n : PAGE;
  const setShown = (f: (s: number) => number) => setMore({ key, n: f(shown) });

  useEffect(() => {
    if (!key) return;
    let alive = true;
    apiFetch(`/api/om/dashboard/rows?${key}`)
      .then((d: { rows: Row[] }) => { if (alive) setData({ key, rows: d.rows, err: "" }); })
      .catch((e) => { if (alive) setData({ key, rows: [], err: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [key]);

  // Esc ปิด — แบบ ModalBase
  useEffect(() => {
    if (!spec) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [spec, onClose]);

  if (!spec) return null;
  const rows = data?.key === key ? data.rows : null;
  const err = data?.key === key ? data.err : "";

  // แถบสรุป — ผลรวมของแถวชุดเดียวกับที่ลิสต์โชว์ จึงตรงกับตัวเลขที่กดเข้ามาเสมอ
  const strip: [string, string, string][] | null = !rows?.length ? null
    : spec.kind === "value" ? [
        ["จำนวนงาน", `${n(rows.length)} งาน`, "text-gray-900"],
        ["มูลค่ารวม", fmtBaht(rows.reduce((s, r) => s + (r.total ?? 0), 0)), "text-gray-900"],
        ["รับแล้ว", fmtBaht(rows.reduce((s, r) => s + (r.received ?? 0), 0)), "text-emerald-700"],
        ["ยังค้างรับ", fmtBaht(rows.reduce((s, r) => s + (r.outstanding ?? 0), 0)), "text-amber-700"],
      ]
    : spec.kind === "quota" ? [
        ["จำนวนบ้าน", `${n(rows.length)} หลัง`, "text-gray-900"],
        ["ให้ไว้", `${n(rows.reduce((s, r) => s + (r.granted ?? 0), 0))} ครั้ง`, "text-gray-900"],
        ["ใช้ไป", `${n(rows.reduce((s, r) => s + (r.used ?? 0), 0))} ครั้ง`, "text-teal-700"],
        ["คงเหลือ", `${n(rows.reduce((s, r) => s + (r.left ?? 0), 0))} ครั้ง`, "text-gray-900"],
      ]
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 min-w-0">
            {spec.title} {rows && <span className="text-base font-normal text-gray-500 ml-1">({n(rows.length)})</span>}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {/* PDF รวมใบบริการ — แท็บปิดงานอย่างเดียว (ผู้ใช้เคาะ 15 ต.ค. 69) · เรียงตามลำดับในรายชื่อ */}
            {spec.kind === "tab" && spec.params.k === "closed" && !!rows?.some((r) => r.booking_id) && (
              <BundlePdfButton title={spec.title}
                ids={rows.map((r) => r.booking_id).filter((x): x is number => !!x)} />
            )}
            {!!rows?.length && (
              <button type="button" onClick={() => downloadSheet(COLS[spec.kind], rows, "O&M", spec.title)}
                className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
                title={`ดาวน์โหลด Excel (${rows.length} รายการ)`}>
                <DownloadIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                <span>Excel</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="ปิด"
              className="cursor-pointer w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl">✕</button>
          </div>
        </div>

        {strip && (
          <div className="grid grid-cols-4 gap-px bg-gray-200 border-b border-gray-200 text-center">
            {strip.map(([label, val, cls]) => (
              <div key={label} className="bg-gray-50 px-2 py-2">
                <div className="text-xxs text-gray-500">{label}</div>
                <div className={`text-sm font-bold font-mono tabular-nums ${cls}`}>{val}</div>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-auto divide-y divide-gray-100">
          {err ? <div className="m-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>
            : rows === null ? (
              <div className="flex justify-center py-10"><div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>
            ) : rows.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">ไม่มีรายการ</div>
            : rows.slice(0, shown).map((r, i) => (
              <a key={`${r.house_id}-${r.doc_no ?? r.service_date ?? ""}-${i}`} href={hrefOf(spec.kind, r)} target="_blank" rel="noreferrer"
                className="cursor-pointer flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 no-underline">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-gray-600 font-bold text-sm">
                  {(r.customer_name || r.house_number || "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate flex items-baseline gap-2">
                    <span className="truncate">{r.customer_name || "ไม่มีชื่อ"}</span>
                    {spec.kind === "washed" && r.service_date && <span className="text-xs font-normal text-gray-400 shrink-0">ล้าง {thDate(r.service_date)}</span>}
                    {spec.kind === "value" && r.at && <span className="text-xs font-normal text-gray-400 shrink-0">รับใบเสนอราคา {thDate(r.at)}</span>}
                  </div>
                  {/* คอลัมน์กว้างคงที่ ให้แต่ละแถวอ่านเป็นตารางเล็ก ๆ แบบ Dashboard I */}
                  <div className="text-xs text-gray-500 flex items-baseline gap-3 font-mono tabular-nums whitespace-nowrap">
                    {spec.kind === "value" && <span className="w-36 shrink-0 truncate">{r.doc_no || "—"}</span>}
                    <span className="w-24 shrink-0 truncate">บ้าน {r.house_number || "—"}</span>
                    <span className="flex-1 min-w-0 truncate font-sans">{r.project_name || ""}</span>
                    {(spec.kind === "tab" || spec.kind === "house") && (
                      <span className="max-sm:hidden w-24 shrink-0 text-right">{r.last_wash ? `ล้าง ${thDate(r.last_wash)}` : "ยังไม่เคยล้าง"}</span>
                    )}
                    {spec.kind === "washed" && r.booking_id && <span className="w-16 shrink-0 text-right">#{r.booking_id}</span>}
                  </div>
                </div>
                {/* ช่องขวา — เงิน / สิทธิ์ / ป้ายสถานะ ตามชนิดรายการ */}
                {spec.kind === "value" && (
                  <div className="shrink-0 w-28 text-right font-mono tabular-nums leading-tight">
                    <div className="text-xs font-semibold text-gray-800">{fmtBaht(r.total ?? 0)}</div>
                    {(r.outstanding ?? 0) > 0
                      ? <div className="text-xxs text-amber-700">ค้างรับ {fmtBaht(r.outstanding ?? 0)}</div>
                      : <div className="text-xxs text-emerald-600">ชำระครบ</div>}
                  </div>
                )}
                {spec.kind === "quota" && (
                  <div className="shrink-0 text-right font-mono tabular-nums text-xs leading-tight">
                    <div className="font-semibold text-gray-800">คงเหลือ {n(r.left)}</div>
                    <div className="text-xxs text-gray-400">ให้ {n(r.granted)} · ใช้ {n(r.used)}</div>
                  </div>
                )}
                {(spec.kind === "tab" || spec.kind === "house") && (
                  <span className="max-sm:hidden shrink-0 w-14 text-right text-xs font-mono tabular-nums text-gray-500">สิทธิ์ {n(r.balance)}</span>
                )}
                {spec.kind === "tab" && r.bucket && (
                  <span className={`text-xxs font-bold px-2 py-0.5 rounded text-white shrink-0 w-20 text-center ${TONE[r.bucket] ?? "bg-gray-400"}`}>
                    {BUCKET_LABEL[r.bucket] ?? r.bucket}
                  </span>
                )}
                {spec.kind === "house" && (
                  <span className={`text-xxs font-bold px-2 py-0.5 rounded shrink-0 w-20 text-center ${r.due ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {r.due ? "ถึงรอบ" : "ยังไม่ถึงรอบ"}
                  </span>
                )}
                {spec.kind === "value" && r.job_status && (
                  <span className={`max-sm:hidden text-xxs font-bold px-2 py-0.5 rounded text-white shrink-0 w-20 text-center ${statusTone(r.job_status)}`}>
                    {statusLabel(r.job_status)}
                  </span>
                )}
              </a>
            ))}
          {rows && rows.length > shown && (
            <button type="button" onClick={() => setShown((s) => s + PAGE)}
              className="w-full py-3 text-sm font-semibold text-primary hover:bg-gray-50 cursor-pointer">
              แสดงเพิ่ม (เหลืออีก {n(rows.length - shown)}) · ดาวน์โหลด Excel ได้ครบทุกแถว
            </button>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xxs text-gray-400 text-center">
          กดที่แถวเพื่อเปิด{spec.kind === "tab" || spec.kind === "value" ? "หน้างานบริการ" : "หน้าบ้าน / ระบบติดตั้ง"}ในแท็บใหม่
        </div>
      </div>
    </div>
  );
}
