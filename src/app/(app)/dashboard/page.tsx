"use client";
import { DownloadIcon } from "@/components/ui/icons";

import { apiFetch, getUserIdHeader } from "@/lib/api";
import { getWithTtl, setWithTtl, TWO_HOURS_MS } from "@/lib/storage-ttl";
import { useEffect, useMemo, useState } from "react";
import { useOpenLead } from "@/lib/hooks/useOpenLead";
import { LeadLink } from "@/components/lead/LeadLink";
import Header from "@/components/layout/Header";
import { STATUS_CONFIG } from "@/lib/constants/statuses";
import { PRIMARY_REASON_LABEL } from "@/lib/constants/info-labels";
import { getSourceStyle, normalizeSourceKey } from "@/lib/source-tag";
import { formatTHB as fmt } from "@/lib/utils/formatters";

type LifecycleCol = "first_contact_at" | "contact2_at" | "contact3_at" | "contact4_at" | "contact5_at"
  | "sales_pitch_at" | "booking_paid_at" | "survey_date" | "survey_done_at"
  | "quote_issued_at" | "order_paid_at" | "install_date" | "install_started_at" | "install_done_at" | "warranty_at";

type ContactStateField = "first_contact_state" | "contact2_state" | "contact3_state" | "contact4_state" | "contact5_state";

type LifecycleRow = { [K in LifecycleCol]: string | null }
  & { [K in ContactStateField]: "yes" | "no" | null }
  & { id: number; full_name: string; house_number: string | null; status: string; pre_doc_no: string | null; payment_confirmed: boolean | null; pre_slip_uploaded: 0 | 1; lost_reason: string | null; order_installments: string | null; order_paid_count: number; created_at: string | null };

// Moved over from /dashboard-dev — subset of fields the 5-card row needs.
interface DevData {
  funnel: { total: number; has_pre_doc: number; has_survey: number; has_order: number; has_install: number; installed: number; warranty_issued: number };
  total_lost: number;
  sources: { source: string; cnt: number; booked: number; paid: number; installed: number }[];
  lost_reasons: { reason: string; cnt: number }[];
  interest_reasons: { code: string; cnt: number }[];
  interested_count: number;
  undecided_reasons: { reason: string; cnt: number }[];
}

interface DashboardData {
  total_leads: number;
  total_deposits: number;
  total_deposit_value: number;
  total_won: number;
  total_received: number;
  conversion_rate: number;
  this_month: { new_leads: number; closed_count: number; closed_value: number; closed_outstanding: number };
  last_month: { new_leads: number; closed_count: number };
  status_breakdown: { status: string; count: number }[];
  recent_leads: { id: number; full_name: string; status: string; project_name: string; created_at: string }[];
  top_projects: { name: string; lead_count: number; won: number }[];
  recent_activities: { title: string; activity_type: string; created_at: string; full_name: string; by_name: string }[];
  activity_heatmap: { day: string; lead_id: number; full_name: string; lead_status: string; activity_type?: string; total_activities: number; has_paid: boolean }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [devData, setDevData] = useState<DevData | null>(null);
  const [lineUsers, setLineUsers] = useState<{ created_at: string; phone: string | null; house_number: string | null }[]>([]);
  const [lifecycleRows, setLifecycleRows] = useState<LifecycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Click any KPI count → popup lists the leads behind it. Click a name to open
  // that lead's detail in a new tab.
  const [bucket, setBucket] = useState<{ title: string; rows: LifecycleRow[] } | null>(null);
  // Global filter — every chip/funnel/popup downstream uses
  // `filteredLifecycleRows`. Default window: 1 Jan 2026 → today (persists
  // across reloads via localStorage). Leaving "from" or "to" empty disables
  // that side of the bound.
  //   • mode "created"  — lead included if its created_at falls in range
  //   • mode "activity" — lead included if ANY of its lifecycle dates
  //                       (created/first_contact/booking_paid/sales_pitch/
  //                       survey_date/survey_done/quote_issued/order_paid/
  //                       install_date/install_started/install_done/warranty)
  //                       falls in range
  const todayYmd = useMemo(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }, []);
  // Filter initial state reads ?from/?to/?mode from the URL first so the PDF
  // export (puppeteer) lands on the exact slice the user has open. Falls back
  // to the default 2026-01-01 → today range when no query params are present.
  // localStorage still wins on real navigations via the useEffect below.
  const urlFilter = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return { from: p.get("from"), to: p.get("to"), mode: p.get("mode") };
  }, []);
  // Lazy initializers read localStorage on first render — without this, the
  // default state would seed the first fetch + write-back effect would clobber
  // the saved value with the default before the read effect could rescue it.
  // Order: URL params > localStorage (2h TTL) > default.
  const [dateFrom, setDateFrom] = useState<string>(() => {
    if (urlFilter?.from) return urlFilter.from;
    return getWithTtl<string>("dashboard.dateFrom", TWO_HOURS_MS) || "2026-01-01";
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    if (urlFilter?.to) return urlFilter.to;
    return getWithTtl<string>("dashboard.dateTo", TWO_HOURS_MS) || todayYmd;
  });
  const [filterMode, setFilterMode] = useState<"created" | "activity">(() => {
    if (urlFilter?.mode === "activity") return "activity";
    if (urlFilter?.mode === "created") return "created";
    const v = getWithTtl<string>("dashboard.filterMode", TWO_HOURS_MS);
    return v === "activity" ? "activity" : "created";
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  useEffect(() => { setWithTtl("dashboard.dateFrom", dateFrom); }, [dateFrom]);
  useEffect(() => { setWithTtl("dashboard.dateTo",   dateTo);   }, [dateTo]);
  useEffect(() => { setWithTtl("dashboard.filterMode", filterMode); }, [filterMode]);
  const filteredLifecycleRows = useMemo(() => {
    if (!dateFrom && !dateTo) return lifecycleRows;
    const inRange = (v: string | null | undefined): boolean => {
      if (!v) return false;
      const d = String(v).slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    };
    if (filterMode === "created") {
      return lifecycleRows.filter(r => inRange(r.created_at));
    }
    // activity: include lead if ANY of these lifecycle dates falls in range
    const activityCols: (keyof LifecycleRow)[] = [
      "created_at", "first_contact_at", "sales_pitch_at", "booking_paid_at",
      "survey_date", "survey_done_at", "quote_issued_at", "order_paid_at",
      "install_date", "install_started_at", "install_done_at", "warranty_at",
    ];
    return lifecycleRows.filter(r => activityCols.some(k => inRange(r[k] as string | null)));
  }, [lifecycleRows, dateFrom, dateTo, filterMode]);

  // /api/dashboard re-fetches when the date filter changes so server-aggregated
  // totals (total_received, total_leads, ...) re-scope to the same cohort the
  // client-side filteredLifecycleRows reflects. The other endpoints are
  // cohort-agnostic, so they only fire once on mount.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo)   qs.set("to",   dateTo);
    qs.set("mode", filterMode);
    const q = qs.toString();
    apiFetch(`/api/dashboard?${q}`).then(setData).catch(console.error).finally(() => setLoading(false));
    apiFetch(`/api/dashboard-dev?${q}`).then(setDevData).catch(console.error);
  }, [dateFrom, dateTo, filterMode]);
  useEffect(() => {
    apiFetch("/api/line-users").then(setLineUsers).catch(console.error);
    apiFetch("/api/lifecycle").then((rows: LifecycleRow[]) => setLifecycleRows(rows)).catch(console.error);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;


  return (
    <div className="dashboard-print-root">
      <div className="dashboard-pdf-skip">
        <Header
          title="Dashboard I"
          subtitle="SENA SOLAR ENERGY"
          rightContent={
            <div className="flex items-center gap-2">
              {/* Global created_at filter — every chip / funnel / popup
                  downstream uses filteredLifecycleRows. */}
              <div className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                <select value={filterMode} onChange={e => setFilterMode(e.target.value as "created" | "activity")}
                  className="h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300"
                  title="เลือกเงื่อนไขฟิลเตอร์">
                  <option value="created">วันที่สร้างลีด</option>
                  <option value="activity">กิจกรรม</option>
                </select>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300"
                  title="ช่วงวันที่ (จาก)" />
                <span className="text-gray-400">–</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300"
                  title="ช่วงวันที่ (ถึง)" />
                {(dateFrom !== "2026-01-01" || dateTo !== todayYmd || filterMode !== "created") && (
                  <button type="button" onClick={() => { setDateFrom("2026-01-01"); setDateTo(todayYmd); setFilterMode("created"); }}
                    className="ml-1 h-8 px-2 rounded-lg text-xs text-gray-500 hover:text-gray-700"
                    title="รีเซ็ตเป็น 1 ม.ค. → วันนี้ (วันที่สร้างลีด)">
                    รีเซ็ต
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={pdfLoading}
                onClick={async () => {
                  setPdfLoading(true);
                  try {
                    // Forward the global filter so the PDF mirrors what the
                    // user is staring at. Without these the server would render
                    // the unfiltered default and ship a PDF that doesn't match.
                    const qs = new URLSearchParams();
                    if (dateFrom) qs.set("from", dateFrom);
                    if (dateTo)   qs.set("to",   dateTo);
                    qs.set("mode", filterMode);
                    const res = await fetch(`/api/report/dashboard-pdf?${qs.toString()}`, { headers: { ...getUserIdHeader() } });
                    if (!res.ok) { alert("ดาวน์โหลด PDF ไม่สำเร็จ"); return; }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `dashboard_${new Date().toISOString().slice(0, 10)}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } finally {
                    setPdfLoading(false);
                  }
                }}
                className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60 disabled:cursor-wait transition-colors"
                title="ดาวน์โหลด Dashboard เป็น PDF"
                aria-label="ดาวน์โหลด Dashboard เป็น PDF"
              >
                {pdfLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <span>กำลังสร้าง...</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                    <span>PDF</span>
                  </>
                )}
              </button>
            </div>
          }
        />
      </div>

      {/* Bucket popup — opens when any KPI count is clicked. Lists the leads
          that make up that count; click a name to open the lead detail in a
          new tab. Click backdrop or ✕ to close. */}
      {bucket && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setBucket(null)}
        >
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {bucket.title} <span className="text-base font-normal text-gray-500 ml-1">({bucket.rows.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setBucket(null)}
                className="cursor-pointer w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl"
                aria-label="ปิด"
              >✕</button>
            </div>
            <div className="overflow-auto divide-y divide-gray-100">
              {bucket.rows.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">ไม่มีรายการ</div>
              ) : bucket.rows.map((r) => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG[r.status.split("-")[0]];
                // Payment progress as a real percentage of the order value:
                // sum the `pct` field of each installment that's been paid
                // (the first order_paid_count of them — installments are
                // settled in JSON order). Falls back to null when the
                // JSON is missing/malformed.
                const paidPct = (() => {
                  try {
                    const arr = r.order_installments ? (JSON.parse(r.order_installments) as { pct?: number }[]) : [];
                    if (!Array.isArray(arr) || arr.length === 0) return null;
                    const paidCount = r.order_paid_count ?? 0;
                    return Math.round(arr.slice(0, paidCount).reduce((a, x) => a + (Number(x.pct) || 0), 0));
                  } catch { return null; }
                })();
                const installDateStr = r.install_date
                  ? new Date(r.install_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })
                  : null;
                return (
                  <LeadLink
                    key={r.id}
                    id={r.id}
                    className="cursor-pointer flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-gray-600 font-bold text-sm">
                      {r.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate flex items-baseline gap-2">
                        <span className="truncate">{r.full_name}</span>
                        {r.created_at && (
                          <span className="text-xs font-normal text-gray-400 shrink-0">
                            สร้าง {new Date(r.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                          </span>
                        )}
                      </div>
                      {/* Fixed-width columns so each line in the list reads
                          like a small table — ID / house / paid / install all
                          align vertically across rows. */}
                      <div className="text-xs text-gray-500 flex items-baseline gap-3 font-mono tabular-nums">
                        <span className="w-14 shrink-0">ID {r.id}</span>
                        <span className="w-28 shrink-0 truncate">บ้าน {r.house_number || "—"}</span>
                        <span className={`w-16 shrink-0 ${paidPct === null ? "text-gray-300" : paidPct >= 100 ? "text-emerald-600" : paidPct > 0 ? "text-amber-600" : "text-gray-400"}`}>
                          {paidPct !== null ? `จ่าย ${paidPct}%` : "—"}
                        </span>
                        <span className="w-32 shrink-0 text-sky-700">{installDateStr ? `นัดติดตั้ง ${installDateStr}` : ""}</span>
                      </div>
                      {/* Lost reason — only shown for lost leads so the ยกเลิก
                          bucket popup explains why each lead got marked lost. */}
                      {r.status === "lost" && r.lost_reason && (
                        <div className="text-xs text-rose-700 truncate mt-0.5">เหตุผล: {r.lost_reason}</div>
                      )}
                    </div>
                    <span className={`text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white shrink-0 ${cfg?.color || "bg-gray-400"}`}>
                      {cfg?.label || r.status}
                    </span>
                  </LeadLink>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t border-gray-100 text-xxs text-gray-400 text-center">
              คลิกชื่อเพื่อเปิด lead detail ใน tab ใหม่
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-pdf-content p-3 md:p-6 space-y-3">
        {/* Filter banner — shown when a date range is active so the printed
            PDF is self-describing (reader knows what cohort the numbers cover
            without going back to the screen). Hidden when no range, to avoid
            chrome on the live screen where filter chips already say it. */}
        {(dateFrom || dateTo) && (() => {
          const fmtThai = (s: string) => {
            if (!s) return "—";
            const [y, m, d] = s.split("-");
            return `${d}/${m}/${parseInt(y) + 543}`;
          };
          return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-500 uppercase tracking-wider">Filter</span>
              <span className="font-mono tabular-nums">{fmtThai(dateFrom)} – {fmtThai(dateTo)}</span>
              <span className="text-gray-400">·</span>
              <span>{filterMode === "activity" ? "ตามกิจกรรม" : "ตามวันที่สร้างลีด"}</span>
            </div>
          );
        })()}
        {/* KPI — 2 rows: (1) 4 equal hero cards, each w/ inline breakdown chips
            (2) full-width subway-map funnel of the active 28 booked-paid leads */}
        {(() => {
          const closedValue = Number(data.this_month.closed_value || 0);
          const outstanding = Number(data.this_month.closed_outstanding || 0);
          const fmtMoney = (v: number) => v >= 1000000 ? `฿${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `฿${Math.round(v / 1000)}K` : `฿${fmt(v)}`;

          const today = new Date(new Date().toDateString());
          const bookingPaidRows = filteredLifecycleRows.filter(r => r.booking_paid_at);
          const bookingPaidCount = bookingPaidRows.length;

          // 4 mutually-exclusive buckets sum = total leads:
          //   1) ยกเลิก (status=lost) — extracted first so the other 3 contain
          //      only active leads, otherwise lost would double-count.
          //   2) ติดต่อได้ — booking_paid OR any state=yes (booking override)
          //   3) ติดต่อไม่ได้ — has no, no yes
          //   4) ยังไม่ติดต่อ — no state activity at all
          const lostRows         = filteredLifecycleRows.filter(r => r.status === "lost");
          const contactedYesRows = filteredLifecycleRows.filter(r => r.status !== "lost" && (!!r.booking_paid_at
            || [r.first_contact_state, r.contact2_state, r.contact3_state, r.contact4_state, r.contact5_state].some(s => s === "yes")));
          const contactedNoRows = filteredLifecycleRows.filter(r => {
            if (r.status === "lost" || r.booking_paid_at) return false;
            const states = [r.first_contact_state, r.contact2_state, r.contact3_state, r.contact4_state, r.contact5_state];
            return states.some(s => s === "no") && !states.some(s => s === "yes");
          });
          const notContactedRows = filteredLifecycleRows.filter(r => {
            if (r.status === "lost" || r.booking_paid_at) return false;
            const states = [r.first_contact_state, r.contact2_state, r.contact3_state, r.contact4_state, r.contact5_state];
            return !states.some(s => s === "yes") && !states.some(s => s === "no");
          });
          const lostTotal    = lostRows.length;
          const contactedYes = contactedYesRows.length;
          const contactedNo  = contactedNoRows.length;
          const notContacted = notContactedRows.length;

          const contactedNoPitchRows     = contactedYesRows.filter(r => r.status === "pre_survey" && !r.sales_pitch_at && r.pre_slip_uploaded !== 1);
          const contactedInPitchRows     = contactedYesRows.filter(r => r.status === "pre_survey" && r.sales_pitch_at && r.pre_slip_uploaded !== 1);
          const contactedSlipPendingRows = contactedYesRows.filter(r => r.status === "pre_survey-01" || (r.status === "pre_survey" && r.pre_slip_uploaded === 1));
          // booking_paid_at = "ชำระจองสำรวจ" inside this card. Scoped to
          // contactedYesRows (excludes lost) so the 4 sub-chips partition the
          // card header exactly — lost-after-booking shows up in the Leads
          // card "ยกเลิก" chip and in Row 2's ยกเลิกหลังจอง station instead.
          const contactedBookedRows      = contactedYesRows.filter(r => !!r.booking_paid_at);
          const contactedNoPitch     = contactedNoPitchRows.length;
          const contactedInPitch     = contactedInPitchRows.length;
          const contactedSlipPending = contactedSlipPendingRows.length;
          const contactedBooked      = contactedBookedRows.length;

          // "ได้ใบเสนอราคา" = status=order AND no install_date yet. Once
          // install_date is locked in (regardless of whether status flipped
          // to "install"), the lead moves to the install chip via the rule
          // above, so we exclude those rows from order to keep stations
          // mutually exclusive.
          const orderRows = bookingPaidRows.filter(r => r.status === "order" && !r.install_date);
          const orderPaidFull = orderRows.filter(r => {
            if (!r.order_paid_at) return false;
            const total = (() => { try { return r.order_installments ? (JSON.parse(r.order_installments) as unknown[]).length : 0; } catch { return 0; } })();
            return r.order_paid_count > 0 && r.order_paid_count >= total;
          }).length;
          const orderPaidPartial = orderRows.filter(r => r.order_paid_at).length - orderPaidFull;
          const orderUnpaid = orderRows.length - orderPaidPartial - orderPaidFull;

          const stepWaitSurveyRows       = filteredLifecycleRows.filter(r => r.status === "pre_survey-02");
          const stepSurveyScheduledRows  = bookingPaidRows.filter(r => r.status === "survey" && r.survey_date && new Date(r.survey_date) > today);
          const stepSurveyingRows        = bookingPaidRows.filter(r => r.status === "survey" && (!r.survey_date || new Date(r.survey_date) <= today));
          // "รอใบเสนอราคา" excludes leads with install_date set — those already
  // have a locked-in install schedule (even if status got reverted to quote)
  // so they belong in the install chip, not the quote chip.
  const stepWaitQuoteRows        = bookingPaidRows.filter(r => r.status === "quote" && !r.install_date);
          // Install chips: paid first installment + install_date set. Done
          // is status-based (warranty/gridtie/closed) — same gate the pipeline
          // page uses, so the counts here and the pipeline tab counts agree.
          // install_done_at alone does NOT mark a lead as done: a crew can
          // tick "ติดตั้งเสร็จ" but the remaining sub-steps (ส่งมอบ etc.) keep
          // the macro status at "install" until ใบรับประกัน is issued.
          const notInstallDone = (s: string) => s !== "warranty" && s !== "gridtie" && s !== "closed" && s !== "lost" && s !== "returned";
          const stepInstallScheduledRows = bookingPaidRows.filter(r => (r.order_paid_count ?? 0) > 0 && r.install_date && notInstallDone(r.status) && new Date(r.install_date) > today);
          const stepInstallingRows       = bookingPaidRows.filter(r => (r.order_paid_count ?? 0) > 0 && r.install_date && notInstallDone(r.status) && new Date(r.install_date) <= today);
          const stepDoneRows             = bookingPaidRows.filter(r => ["warranty", "gridtie", "closed"].includes(r.status));
          // นัดติดตั้ง / กำลังติดตั้ง / ติดตั้งเสร็จ breakdown: how many leads
          // have paid every installment (ครบ) vs. only the deposit (มัดจำ).
          // Mirrors the orderPaidFull / orderPaidPartial split used earlier.
          const countFullyPaid = (rs: LifecycleRow[]) => rs.filter(r => {
            const total = (() => { try { return r.order_installments ? (JSON.parse(r.order_installments) as unknown[]).length : 0; } catch { return 0; } })();
            return total > 0 && (r.order_paid_count ?? 0) >= total;
          }).length;
          const installPaidFull = countFullyPaid(stepInstallScheduledRows);
          const installPaidPartial = stepInstallScheduledRows.length - installPaidFull;
          const installingPaidFull = countFullyPaid(stepInstallingRows);
          const installingPaidPartial = stepInstallingRows.length - installingPaidFull;
          const donePaidFull = countFullyPaid(stepDoneRows);
          const donePaidPartial = stepDoneRows.length - donePaidFull;
          const stepLostAfterRows        = bookingPaidRows.filter(r => r.status === "lost");

          const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

          // Clickable chip — always opens the bucket popup, even when empty
          // (popup shows "ไม่มีรายการ" in that case so the cursor stays a hand).
          const Chip = ({ n, l, tone, detail, rows }: { n: number | string; l: string; tone: string; detail?: string; rows?: LifecycleRow[] }) => (
            <button
              type="button"
              onClick={() => setBucket({ title: l, rows: rows ?? [] })}
              className={`cursor-pointer rounded-lg px-2 py-3 text-center min-w-0 ${tone} hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all`}
            >
              <div className="text-xl font-bold font-mono tabular-nums leading-none">{n}</div>
              {detail && <div className="text-xxs font-mono tabular-nums opacity-60 mt-1 truncate">{detail}</div>}
              <div className="text-xxs mt-2 leading-tight truncate opacity-75">{l}</div>
            </button>
          );

          // 4 phase / 4 สี: Survey (violet) → Quote (amber) → Install (sky) →
          // Cancel (rose). ภายใน phase เดียวกันใช้สีเดียวกันเพื่อให้ภาพรวม
          // อ่านเป็นกลุ่มได้ — แทนที่จะไล่เฉดทีละ stage
          const SURVEY  = { cardBg: "bg-violet-100", cardBorder: "border-violet-300", labelColor: "text-violet-800" };
          const QUOTE   = { cardBg: "bg-amber-100",  cardBorder: "border-amber-300",  labelColor: "text-amber-800"  };
          const INSTALL = { cardBg: "bg-sky-100",    cardBorder: "border-sky-300",    labelColor: "text-sky-800"    };
          const CANCEL  = { cardBg: "bg-rose-50",    cardBorder: "border-rose-200",   labelColor: "text-rose-700"   };
          const stations: { l: string; rows: LifecycleRow[]; sub?: string; detail?: string; cardBg: string; cardBorder: string; labelColor: string; dark?: boolean }[] = [
            { l: "รอนัดสำรวจ",    rows: stepWaitSurveyRows,       sub: "ยืนยัน 2 แล้ว",            ...SURVEY },
            { l: "นัดสำรวจ",       rows: stepSurveyScheduledRows,  sub: "นัดแล้ว ยังไม่ถึงวัน",     ...SURVEY },
            { l: "กำลังสำรวจ",     rows: stepSurveyingRows,        sub: "ถึงวัน / ผ่านวันสำรวจ",    ...SURVEY },
            { l: "รอใบเสนอราคา",    rows: stepWaitQuoteRows,        sub: "สำรวจเสร็จ",             ...QUOTE },
            { l: "ได้ใบเสนอราคา",  rows: orderRows, detail: `${orderUnpaid} ยังไม่จ่าย · ${orderPaidPartial} มัดจำ · ${orderPaidFull} ครบ`, ...QUOTE },
            { l: "นัดติดตั้ง",      rows: stepInstallScheduledRows, detail: `${installPaidPartial} มัดจำ · ${installPaidFull} ครบ`, ...INSTALL },
            { l: "กำลังติดตั้ง",    rows: stepInstallingRows,       detail: `${installingPaidPartial} มัดจำ · ${installingPaidFull} ครบ`, ...INSTALL },
            { l: "ติดตั้งเสร็จ",    rows: stepDoneRows,             detail: `${donePaidPartial} มัดจำ · ${donePaidFull} ครบ`, ...INSTALL },
            { l: "ยกเลิกหลังจอง",   rows: stepLostAfterRows,        sub: "Lost after booking",       ...CANCEL },
          ];

          // Big-number click handler — always opens the popup (cursor stays
          // pointer even at count=0, popup just shows "ไม่มีรายการ").
          const openBucket = (title: string, rows: LifecycleRow[]) =>
            () => setBucket({ title, rows });
          const bigNumCls = "cursor-pointer hover:underline decoration-2 underline-offset-4";

          return (
            <div className="space-y-3">
              {/* ROW 1 — 3 hero cards (Leads / ติดต่อได้ / รายได้) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Leads */}
                <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-sm font-bold uppercase tracking-[0.15em] text-gray-500">Leads ทั้งหมด</span>
                    <span className="text-xs font-semibold text-emerald-600">+{data.this_month.new_leads || 0} เดือนนี้</span>
                  </div>
                  <button
                    type="button"
                    onClick={openBucket("Leads ทั้งหมด", filteredLifecycleRows)}
                    className={`text-left text-3xl font-bold font-mono tabular-nums text-gray-900 leading-none ${bigNumCls}`}
                  >{filteredLifecycleRows.length}</button>
                  <div className="mt-auto pt-4 grid grid-cols-4 gap-1.5">
                    <Chip n={notContacted}  l="รอติดตาม"      tone="bg-sky-50 text-sky-700"           rows={notContactedRows} />
                    <Chip n={contactedNo}   l="ติดต่อไม่ได้"   tone="bg-rose-50 text-rose-700"          rows={contactedNoRows} />
                    <Chip n={contactedYes}  l="ติดต่อได้"      tone="bg-emerald-600 text-white"         rows={contactedYesRows} />
                    <Chip n={lostTotal}     l="ยกเลิก"        tone="bg-gray-300 text-gray-800"          rows={lostRows} />
                  </div>
                </div>

                {/* ติดต่อได้ — ปลายทาง */}
                <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-sm font-bold uppercase tracking-[0.15em] text-emerald-700">ติดต่อได้ — ปลายทาง</span>
                    <span className="text-xs font-semibold text-gray-500">{pct(contactedYes, filteredLifecycleRows.length)}% reach</span>
                  </div>
                  <button
                    type="button"
                    onClick={openBucket("ติดต่อได้", contactedYesRows)}
                    className={`text-left text-3xl font-bold font-mono tabular-nums text-gray-900 leading-none ${bigNumCls}`}
                  >{contactedYes}</button>
                  <div className="mt-auto pt-4 grid grid-cols-4 gap-1">
                    <Chip n={contactedNoPitch}     l="ยังไม่สะดวกคุย" tone="bg-gray-100 text-gray-700"     rows={contactedNoPitchRows} />
                    <Chip n={contactedInPitch}     l="ระหว่างเสนอ"   tone="bg-indigo-50 text-indigo-700"  rows={contactedInPitchRows} />
                    <Chip n={contactedSlipPending} l="รอรับเงินจอง"   tone="bg-amber-50 text-amber-700"    rows={contactedSlipPendingRows} />
                    <Chip n={contactedBooked}      l="ชำระจองสำรวจ"   tone="bg-emerald-600 text-white"      rows={contactedBookedRows} />
                  </div>
                </div>

                {/* รับเงินแล้ว — total all-time confirmed payments (ยืนยัน 2) */}
                <div className="rounded-2xl bg-teal-200 border border-teal-400 p-4 flex flex-col">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-sm font-bold uppercase tracking-[0.15em] text-teal-800">รับเงินแล้ว</span>
                    <span className="text-xs font-semibold text-teal-700">บัญชียืนยันแล้ว</span>
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-teal-900 leading-none">{fmtMoney(Number(data.total_received || 0))}</div>
                  <div className="mt-auto pt-3 grid grid-cols-2 gap-2 border-t border-teal-400/60">
                    <div>
                      <div className="text-xs text-teal-700 leading-tight">รายได้เดือนนี้</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-teal-900 leading-none mt-0.5">{fmtMoney(closedValue)} <span className="text-xs font-normal text-teal-700">· {data.this_month.closed_count || 0} งาน</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-teal-700 leading-tight">ยังค้างรับ</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-amber-700 leading-none mt-0.5">{fmtMoney(outstanding)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ROW 2 — ชำระจองสำรวจ wrapper + 9 child KPI cards */}
              <div className="rounded-2xl bg-white border border-emerald-300 p-4">
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={openBucket("ชำระจองสำรวจ", bookingPaidRows.filter(r => r.status !== "lost"))}
                      className={`text-3xl font-bold font-mono tabular-nums text-emerald-700 leading-none ${bigNumCls}`}
                    >{bookingPaidCount - stepLostAfterRows.length}</button>
                    <span className="text-sm font-bold uppercase tracking-[0.15em] text-emerald-700">ชำระจองสำรวจ</span>
                    {stepLostAfterRows.length > 0 && (
                      <button
                        type="button"
                        onClick={openBucket("ยกเลิกหลังจอง", stepLostAfterRows)}
                        className={`text-xs font-semibold text-rose-600 ${bigNumCls}`}
                      >+ {stepLostAfterRows.length} ยกเลิกหลังจอง</button>
                    )}
                    <span className="text-xs font-semibold text-gray-500">{pct(bookingPaidCount, contactedYes)}% ของติดต่อได้</span>
                  </div>
                  <span className="text-xxs text-gray-400">แตกย่อยตาม step ปัจจุบัน (sum = ชำระจองสำรวจ)</span>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
                  {stations.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBucket({ title: s.l, rows: s.rows })}
                      className={`cursor-pointer text-left rounded-xl border p-3 ${s.cardBg} ${s.cardBorder} hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all`}
                    >
                      <div className={`text-sm font-bold uppercase tracking-[0.1em] leading-tight ${s.labelColor}`}>{s.l}</div>
                      <div className={`text-2xl font-bold font-mono tabular-nums leading-none mt-1.5 ${s.dark ? "text-white" : "text-gray-900"}`}>{s.rows.length}</div>
                      {s.detail
                        ? <div className={`text-xxs mt-1.5 font-mono tabular-nums leading-tight ${s.dark ? "text-white/85" : "text-gray-500"}`}>{s.detail}</div>
                        : <div className={`text-xxs mt-1.5 leading-tight truncate ${s.dark ? "text-white/75" : "text-gray-400"}`}>{s.sub}</div>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Lifecycle funnel — full width */}
        <div className="rounded-xl bg-white border border-gray-300 p-4">
          <LifecycleFunnelChart rows={filteredLifecycleRows} onStageClick={(title, r) => setBucket({ title, rows: r })} />
        </div>

        {/* Source quality chart — full width */}
        {devData && (
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">Lead&apos;s Source</div>
            </div>
            <SourceQualityChart sources={devData.sources} />
            <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</div>
          </div>
        )}

        {/* Activity Heatmap */}
        <div className="rounded-xl bg-white border border-gray-300 p-4">
          <ActivityChart data={data.activity_heatmap} />
        </div>

        {/* LINE OA growth */}
        <div className="rounded-xl bg-white border border-gray-300 p-4">
          <LineGrowthChart users={lineUsers} />
        </div>

        {/* Interest / Undecided / Lost — 3 reason cards */}
        {devData && (() => {
          const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
          // Pulled in locally — the outer IIFE that owns openBucket/lostRows
          // closes before this block, so the click handlers need their own.
          const lostRows = filteredLifecycleRows.filter(r => r.status === "lost");
          const bigNumCls = "cursor-pointer hover:underline decoration-2 underline-offset-4";
          const openBucket = (title: string, rows: LifecycleRow[]) => () => setBucket({ title, rows });
          return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white border border-gray-300 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">เหตุผลที่สนใจ <span className="normal-case text-gray-300">(prospects)</span></div>
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-700">{devData.interested_count}</div>
                </div>
                {devData.interest_reasons.length > 0 ? (
                  <BarList
                    items={devData.interest_reasons.map(r => ({ label: PRIMARY_REASON_LABEL[r.code] || r.code, value: r.cnt }))}
                    color="bg-emerald-500"
                  />
                ) : (
                  <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
                )}
                <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
              </div>
              <div className="rounded-xl bg-white border border-gray-300 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">เหตุผลที่ยังไม่จอง</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-700">{devData.undecided_reasons.reduce((a, b) => a + b.cnt, 0)}</div>
                </div>
                {devData.undecided_reasons.length > 0 ? (
                  <BarList
                    items={devData.undecided_reasons.map(r => ({ label: r.reason, value: r.cnt }))}
                    color="bg-amber-400"
                  />
                ) : (
                  <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
                )}
                <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
              </div>
              <div className="rounded-xl bg-white border border-gray-300 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">เหตุผลที่ Lost</div>
                  <button
                    type="button"
                    onClick={openBucket("ยกเลิก", lostRows)}
                    className={`text-lg font-bold font-mono tabular-nums text-red-600 ${bigNumCls}`}
                  >{devData.total_lost}</button>
                </div>
                {devData.lost_reasons.length > 0 || devData.total_lost > 0 ? (
                  <LostReasonsByGroup
                    items={devData.lost_reasons}
                    rows={lostRows}
                    onOpenBucket={(title, rows) => setBucket({ title, rows })}
                  />
                ) : (
                  <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
                )}
                <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

function ActivityChart({ data }: { data: { day: string; lead_id: number; full_name: string; lead_status: string; activity_type?: string; total_activities: number; has_paid: boolean }[] }) {
  const openLead = useOpenLead();
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<"all" | "create" | "activity">("all");
  useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);

  // Filter rows by mode (All / Create / Activity)
  const filteredData = data.filter(row => {
    if (mode === "all") return true;
    if (mode === "create") return row.activity_type === "lead_created";
    return row.activity_type && row.activity_type !== "lead_created";
  });

  // X-axis stays a fixed 30-day rolling window (+3 future buffer) regardless
  // of the global filter — the chart's job is to surface what's happening
  // RECENTLY, not to re-window with the filter. The filter still applies to
  // the bar data (lead_id IN eligibleSet on the server), so a date-restricted
  // dashboard shows fewer/zero blocks on days outside the cohort.
  const today = new Date();
  const HISTORY = 30;
  const FUTURE_PAD = 3;
  const allDayKeys: string[] = [];
  for (let i = HISTORY - 1; i >= -FUTURE_PAD; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    allDayKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  const dayKeys = isMobile
    ? (() => {
        const keys: string[] = [];
        for (let i = 6; i >= -1; i--) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
        return keys;
      })()
    : allDayKeys;

  type Block = { lead_id: number; name: string; total: number; paid: boolean; status: string; actType: string };
  const byDay: Record<string, Block[]> = {};
  dayKeys.forEach(k => { byDay[k] = []; });

  const seen: Record<string, Set<number>> = {};
  dayKeys.forEach(k => { seen[k] = new Set(); });

  filteredData.forEach(row => {
    const dk = String(row.day).slice(0, 10);
    if (!byDay[dk] || seen[dk].has(row.lead_id)) return;
    seen[dk].add(row.lead_id);
    byDay[dk].push({ lead_id: row.lead_id, name: row.full_name, total: row.total_activities, paid: !!row.has_paid, status: row.lead_status, actType: row.activity_type || "" });
  });

  const maxLeads = Math.max(...dayKeys.map(k => byDay[k].length), 1);
  const maxTotal = Math.max(...filteredData.map(d => d.total_activities), 1);

  const primaryColors = ["bg-primary/50", "bg-primary/65", "bg-primary/80", "bg-primary/90", "bg-primary"];
  const blueColors = ["bg-sky-200", "bg-sky-300", "bg-sky-400", "bg-sky-500", "bg-sky-600"];
  const redColors = ["bg-red-200", "bg-red-300", "bg-red-400", "bg-red-500", "bg-red-600"];

  const getColor = (total: number, actType: string, status: string) => {
    const colors = status === "lost" || status === "returned"
      ? redColors
      : actType === "lead_created" ? blueColors : primaryColors;
    const ratio = total / maxTotal;
    if (ratio <= 0.2) return colors[0];
    if (ratio <= 0.4) return colors[1];
    if (ratio <= 0.6) return colors[2];
    if (ratio <= 0.8) return colors[3];
    return colors[4];
  };

  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  // Block size fixed; chart container grows so every block fits at its real
  // size without overflow.
  const blockH = 7;
  const ROW_GAP = 2;
  const chartH = maxLeads * (blockH + ROW_GAP) + 20;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          การติดตามลูกค้า <span className="normal-case text-gray-300">(30 วันล่าสุด)</span>
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-xxs font-medium text-gray-700 focus:outline-none focus:border-gray-400"
        >
          <option value="all">All</option>
          <option value="create">Create</option>
          <option value="activity">Activity</option>
        </select>
      </div>
      <div className="flex">
        {/* Y axis — only max + 0 */}
        <div className="flex flex-col justify-between pr-2" style={{ height: chartH }}>
          <div className="text-xxs text-gray-400 text-right leading-none">{maxLeads}</div>
          <div className="text-xxs text-gray-400 text-right leading-none">0</div>
        </div>
        {/* Bars */}
        <div className="flex-1 flex items-end gap-[3px] border-l border-b border-gray-200" style={{ height: chartH }}>
          {dayKeys.map(dk => {
            const blocks = byDay[dk];
            return (
              <div key={dk} className="flex-1 min-w-0 flex flex-col-reverse gap-[2px] items-stretch" style={{ height: "100%" }}>
                {blocks.map((b, i) => (
                  <div
                    key={i}
                    className={`rounded-sm shrink-0 ${getColor(b.total, b.actType, b.status)} hover:ring-1 hover:ring-primary cursor-pointer`}
                    style={{ height: blockH, minHeight: blockH }}
                    onMouseEnter={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const isFollow = ["follow_up","call","visit","note"].includes(b.actType);
                      const statusLabel: Record<string,string> = { pre_survey: "รอติดตาม", survey: "รอสำรวจ", quote: "รอใบเสนอราคา", order: "รออนุมัติ/ชำระ", install: "กำลังติดตั้ง", closed: "ส่งมอบแล้ว", lost: "ยกเลิก", returned: "ส่งกลับ Seeker" };
                      const label = isFollow ? "ติดตาม" : (statusLabel[b.status] || b.status);
                      setTooltip({ x: r.left + r.width / 2, y: r.top - 4, text: `${b.name} · ${label} · ${b.total} ครั้ง` });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => openLead(b.lead_id)}
                  />
                ))}
                {blocks.length > 0 && (
                  <div className="text-center text-xxs font-bold text-gray-700 tabular-nums leading-none mb-0.5">{blocks.length}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* X axis: dates */}
      <div className="flex gap-[3px] mt-1 ml-6">
        {dayKeys.map(dk => (
          <div key={dk} className="flex-1 min-w-0 text-center text-xxs text-gray-400 truncate">
            {parseInt(dk.slice(8))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">1 block = 1 lead · สีเข้ม = ติดตามหลายครั้ง</span>
        <div className="flex items-center gap-3 text-xxs text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-sky-400" />
            <span>New Lead</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-primary" />
            <span>ติดตาม</span>
          </div>
          <div className="flex items-center gap-0.5">
            <span>จาง</span>
            <div className="w-[8px] h-[8px] rounded-sm bg-primary/20" />
            <div className="w-[8px] h-[8px] rounded-sm bg-primary" />
            <span>เข้ม = หลายครั้ง</span>
          </div>
        </div>
      </div>
      {tooltip && (
        <div className="fixed z-50 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function LineGrowthChart({ users }: { users: { created_at: string; phone: string | null; house_number: string | null }[] }) {
  const [mode, setMode] = useState<"all" | "line" | "line_phone">("all");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);
  // Filter users by mode: All / Line (no contact) / Line + Phone (has contact)
  const filteredUsers = users.filter(u => {
    if (mode === "all") return true;
    const hasContact = !!u.phone || !!u.house_number;
    if (mode === "line") return !hasContact;
    return hasContact;
  });
  // Rolling 30 days history + 3-day future buffer. Mobile shrinks to 7+1 since
  // there's no horizontal room for 33 columns.
  const today = new Date();
  const HISTORY = isMobile ? 7 : 30;
  const FUTURE_PAD = isMobile ? 1 : 3;
  const dayKeys: string[] = [];
  for (let i = HISTORY - 1; i >= -FUTURE_PAD; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    dayKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const indexByKey = new Map(dayKeys.map((k, i) => [k, i]));

  const byDay: { phone: string | null; house_number: string | null; ts: number }[][] = dayKeys.map(() => []);
  for (const u of filteredUsers) {
    const d = new Date(String(u.created_at));
    if (isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const idx = indexByKey.get(k);
    if (idx === undefined) continue;
    byDay[idx].push({ phone: u.phone, house_number: u.house_number, ts: d.getTime() });
  }
  for (const blocks of byDay) blocks.sort((a, b) => a.ts - b.ts);

  const counts = byDay.map((b) => b.length);
  const maxCount = Math.max(...counts, 1);
  // Block size fixed; chart grows to fit max-day stack.
  const blockH = 7;
  const ROW_GAP = 2;
  const chartH = maxCount * (blockH + ROW_GAP) + 20;

  const totalMonth = counts.reduce((a, b) => a + b, 0);
  const totalWithContact = byDay.flat().filter((b) => !!b.phone || !!b.house_number).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Add LINE OA รายวัน <span className="normal-case text-gray-300">(30 วันล่าสุด)</span>
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-xxs font-medium text-gray-700 focus:outline-none focus:border-gray-400"
        >
          <option value="all">All</option>
          <option value="line">Line</option>
          <option value="line_phone">Line + Phone</option>
        </select>
      </div>
      <div className="flex">
        <div className="flex flex-col justify-between pr-2" style={{ height: chartH }}>
          <div className="text-xxs text-gray-400 text-right leading-none">{maxCount}</div>
          <div className="text-xxs text-gray-400 text-right leading-none">0</div>
        </div>
        <div className="flex-1 flex items-end gap-[3px] border-l border-b border-gray-200" style={{ height: chartH }}>
          {byDay.map((blocks, i) => (
            <div key={i} className="flex-1 min-w-0 flex flex-col-reverse gap-[2px] items-stretch" style={{ height: "100%" }}>
              {blocks.map((b, j) => {
                const hasContact = !!b.phone || !!b.house_number;
                const tip = [b.phone && `เบอร์ ${b.phone}`, b.house_number && `บ้าน ${b.house_number}`].filter(Boolean).join(" · ") || "ยังไม่มีข้อมูล";
                const dayLabel = parseInt(dayKeys[i].slice(8));
                return (
                  <div
                    key={j}
                    className={`rounded-sm shrink-0 ${hasContact ? "bg-blue-600" : "bg-emerald-500"}`}
                    style={{ height: blockH, minHeight: blockH }}
                    title={`${dayLabel} · ${tip}`}
                  />
                );
              })}
              {blocks.length > 0 && (
                <div className="text-center text-xxs font-bold text-gray-700 tabular-nums leading-none mb-0.5">{blocks.length}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-[3px] mt-1 ml-6">
        {dayKeys.map((dk, i) => (
          <div key={i} className="flex-1 min-w-0 text-center text-xxs text-gray-400 truncate">{parseInt(dk.slice(8))}</div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">รวม 30 วัน {totalMonth} คน · ให้ข้อมูล {totalWithContact} คน · 1 block = 1 user</span>
        <div className="flex items-center gap-3 text-xxs text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-blue-600" />
            <span>มีเบอร์/บ้านเลขที่</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-emerald-500" />
            <span>ยังไม่ให้ข้อมูล</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Funnel chart that mirrors the KPI cards above 1:1 — every stage's label,
// definition, and count matches a chip or row-2 station on the dashboard so
// the two sections can never disagree. booking_paid_at counts as "ติดต่อได้"
// (same override as KPI), so a lead that paid but never had a successful
// contact-attempt logged (e.g. lead 438) is still in ติดต่อได้.
function LifecycleFunnelChart({ rows, onStageClick }: { rows: LifecycleRow[]; onStageClick?: (title: string, rows: LifecycleRow[]) => void }) {
  const CONTACT_STATES: ContactStateField[] = [
    "first_contact_state", "contact2_state", "contact3_state", "contact4_state", "contact5_state",
  ];
  const today = new Date(new Date().toDateString());
  const stateList = (r: LifecycleRow) => CONTACT_STATES.map(s => r[s]);
  const hasYes = (r: LifecycleRow) => stateList(r).some(s => s === "yes");
  const hasNo  = (r: LifecycleRow) => stateList(r).some(s => s === "no");
  const isPaid = (r: LifecycleRow) => !!r.booking_paid_at;

  // Contact section — 4 mutually-exclusive buckets sum = total leads, matching
  // Leads card chips exactly. Lost is extracted first so the other 3 contain
  // only active leads (no double-count with the terminal ยกเลิก bar).
  const isLost = (r: LifecycleRow) => r.status === "lost";
  const noContactRows  = rows.filter(r => !isLost(r) && !isPaid(r) && !hasYes(r) && !hasNo(r));
  const contactNoRows  = rows.filter(r => !isLost(r) && !isPaid(r) && hasNo(r) && !hasYes(r));
  const contactYesRows = rows.filter(r => !isLost(r) && (isPaid(r) || hasYes(r)));

  // ติดต่อได้ — ปลายทาง: same 4 mutually-exclusive buckets as KPI card 2
  // (sum = contactYesRows.length). Lost is excluded above so we don't add a
  // 5th bar for it.
  const destNoPitchRows     = contactYesRows.filter(r => r.status === "pre_survey" && !r.sales_pitch_at && r.pre_slip_uploaded !== 1);
  const destInPitchRows     = contactYesRows.filter(r => r.status === "pre_survey" && r.sales_pitch_at && r.pre_slip_uploaded !== 1);
  const destSlipPendingRows = contactYesRows.filter(r => r.status === "pre_survey-01" || (r.status === "pre_survey" && r.pre_slip_uploaded === 1));
  const destBookedRows      = contactYesRows.filter(r => !!r.booking_paid_at);

  // ชำระจองสำรวจ — same 9 buckets as KPI row 2 stations (sum = bookingPaid).
  const bookingPaidRows = rows.filter(r => r.booking_paid_at);
  const stepWaitSurveyRows       = rows.filter(r => r.status === "pre_survey-02");
  const stepSurveyScheduledRows  = bookingPaidRows.filter(r => r.status === "survey" && r.survey_date && new Date(r.survey_date) > today);
  const stepSurveyingRows        = bookingPaidRows.filter(r => r.status === "survey" && (!r.survey_date || new Date(r.survey_date) <= today));
  // "รอใบเสนอราคา" excludes leads with install_date set — those already
  // have a locked-in install schedule (even if status got reverted to quote)
  // so they belong in the install chip, not the quote chip.
  const stepWaitQuoteRows        = bookingPaidRows.filter(r => r.status === "quote" && !r.install_date);
  // Mirror of the dashboard page rule — exclude order leads that already
  // have install_date set (those land in the install chip instead).
  const orderRowsList            = bookingPaidRows.filter(r => r.status === "order" && !r.install_date);
  // Mirror of the dashboard page rule — install chip ignores status; the
  // earlier quote/order chips exclude install_date-set rows to avoid overlap.
  const stepInstallScheduledRows = bookingPaidRows.filter(r => (r.order_paid_count ?? 0) > 0 && r.install_date && !r.install_done_at && new Date(r.install_date) > today);
  const stepInstallingRows       = bookingPaidRows.filter(r => (r.order_paid_count ?? 0) > 0 && r.install_date && new Date(r.install_date) <= today && !r.install_done_at);
  const stepDoneRows             = bookingPaidRows.filter(r => ["warranty", "gridtie", "closed"].includes(r.status));
  const stepLostAfterRows        = bookingPaidRows.filter(r => r.status === "lost");

  // ยกเลิก — every lost lead (= countsByStatus['lost']). Overlaps with contact
  // buckets above because lost can happen at any stage; shown separately as a
  // terminal-state column so the user sees total churn at a glance.
  const lostRows = rows.filter(r => r.status === "lost");

  type Seg = { color: string; count: number; rows: LifecycleRow[]; subLabel?: string };
  const stages: { label: string; total: number; rows: LifecycleRow[]; segments: Seg[] }[] = [
    // การติดต่อ — 3 columns, sum = total leads
    { label: "ยังไม่ติดต่อ",  total: noContactRows.length,  rows: noContactRows,
      segments: [{ color: "bg-gray-400",   count: noContactRows.length,  rows: noContactRows }] },
    { label: "ติดต่อไม่ได้",  total: contactNoRows.length,  rows: contactNoRows,
      segments: [{ color: "bg-rose-400",   count: contactNoRows.length,  rows: contactNoRows }] },
    { label: "ติดต่อได้",     total: contactYesRows.length, rows: contactYesRows,
      segments: [{ color: "bg-emerald-500", count: contactYesRows.length, rows: contactYesRows }] },
    // ปลายทางติดต่อได้ — 5 columns matching KPI ติดต่อได้-ปลายทาง card
    { label: "ยังไม่สะดวกคุย", total: destNoPitchRows.length,     rows: destNoPitchRows,
      segments: [{ color: "bg-gray-400",    count: destNoPitchRows.length,     rows: destNoPitchRows }] },
    { label: "ระหว่างเสนอ",    total: destInPitchRows.length,     rows: destInPitchRows,
      segments: [{ color: "bg-indigo-500",  count: destInPitchRows.length,     rows: destInPitchRows }] },
    { label: "รอรับเงินจอง",   total: destSlipPendingRows.length, rows: destSlipPendingRows,
      segments: [{ color: "bg-amber-500",   count: destSlipPendingRows.length, rows: destSlipPendingRows }] },
    { label: "ชำระจองสำรวจ",       total: destBookedRows.length,      rows: destBookedRows,
      segments: [{ color: "bg-emerald-600", count: destBookedRows.length,      rows: destBookedRows }] },
    // ชำระจองสำรวจ — 9 columns matching KPI row 2 stations
    { label: "รอนัดสำรวจ",    total: stepWaitSurveyRows.length,       rows: stepWaitSurveyRows,
      segments: [{ color: "bg-purple-500", count: stepWaitSurveyRows.length,       rows: stepWaitSurveyRows }] },
    { label: "นัดสำรวจ",       total: stepSurveyScheduledRows.length,  rows: stepSurveyScheduledRows,
      segments: [{ color: "bg-cyan-500",   count: stepSurveyScheduledRows.length,  rows: stepSurveyScheduledRows }] },
    { label: "กำลังสำรวจ",     total: stepSurveyingRows.length,        rows: stepSurveyingRows,
      segments: [{ color: "bg-sky-500",    count: stepSurveyingRows.length,        rows: stepSurveyingRows }] },
    { label: "รอใบเสนอราคา",    total: stepWaitQuoteRows.length,        rows: stepWaitQuoteRows,
      segments: [{ color: "bg-yellow-500", count: stepWaitQuoteRows.length,        rows: stepWaitQuoteRows }] },
    { label: "ได้ใบเสนอราคา",  total: orderRowsList.length,            rows: orderRowsList,
      segments: [{ color: "bg-lime-500",   count: orderRowsList.length,            rows: orderRowsList }] },
    { label: "นัดติดตั้ง",      total: stepInstallScheduledRows.length, rows: stepInstallScheduledRows,
      segments: [{ color: "bg-blue-500",   count: stepInstallScheduledRows.length, rows: stepInstallScheduledRows }] },
    { label: "กำลังติดตั้ง",    total: stepInstallingRows.length,       rows: stepInstallingRows,
      segments: [{ color: "bg-indigo-500", count: stepInstallingRows.length,       rows: stepInstallingRows }] },
    { label: "ติดตั้งเสร็จ",    total: stepDoneRows.length,             rows: stepDoneRows,
      segments: [{ color: "bg-teal-500",   count: stepDoneRows.length,             rows: stepDoneRows }] },
    { label: "ยกเลิกหลังจอง",   total: stepLostAfterRows.length,        rows: stepLostAfterRows,
      segments: [{ color: "bg-rose-500",   count: stepLostAfterRows.length,        rows: stepLostAfterRows }] },
    // Terminal
    { label: "ยกเลิก (รวม)",   total: lostRows.length,        rows: lostRows,
      segments: [{ color: "bg-gray-500",   count: lostRows.length,        rows: lostRows }] },
  ];

  // Group header band — span matches the # of stages that bucket under each.
  const groups = [
    { title: "การติดต่อ",                  tone: "bg-sky-50 text-sky-800 border-sky-200",            span: 3 },
    { title: "ติดต่อได้ — ปลายทาง",          tone: "bg-emerald-50 text-emerald-800 border-emerald-200", span: 4 },
    { title: "รายละเอียดจากชำระจองสำรวจ",     tone: "bg-emerald-50 text-emerald-800 border-emerald-200", span: 9 },
    { title: "ยกเลิก",                     tone: "bg-rose-50 text-rose-700 border-rose-200",         span: 1 },
  ];

  const maxTotal = Math.max(...stages.map(s => s.total), 1);
  const chartH = 180;
  const usableH = chartH - 24;

  return (
    <div>
      <div className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Lead&apos;s Stage
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          <div className="flex gap-[3px] mb-1">
            {groups.map(g => (
              <div key={g.title}
                   className={`text-xxs font-semibold text-center py-1 px-1 rounded border ${g.tone}`}
                   style={{ flex: g.span, minWidth: 0 }}>
                {g.title}
              </div>
            ))}
          </div>
          <div className="flex items-end gap-[3px] border-l border-b border-gray-200" style={{ height: chartH }}>
            {stages.map((stage, i) => {
              const totalH = (stage.total / maxTotal) * usableH;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onStageClick?.(stage.label, stage.rows)}
                  className="cursor-pointer flex-1 min-w-0 flex flex-col items-stretch justify-end px-0.5 hover:bg-gray-50 transition-colors"
                  style={{ height: "100%" }}
                >
                  <div className="text-center text-xxs font-bold text-gray-700 tabular-nums leading-none mb-1">{stage.total}</div>
                  <div className="overflow-hidden flex flex-col-reverse" style={{ height: Math.max(totalH, stage.total > 0 ? 4 : 0) }}>
                    {stage.segments.map((seg, j) => (
                      seg.count > 0 ? (
                        <div key={j}
                             className={`${seg.color} flex items-center justify-center`}
                             style={{ height: `${(seg.count / Math.max(stage.total, 1)) * 100}%` }}>
                          {stage.segments.length > 1 && (
                            <span className="text-xxs font-bold text-white tabular-nums leading-none">{seg.count}</span>
                          )}
                        </div>
                      ) : null
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-[3px] mt-1">
            {stages.map((stage, i) => (
              <div key={i} className="flex-1 min-w-0 text-center text-xxs text-gray-500 leading-tight px-0.5">
                {stage.label}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xxs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span>ติดต่อได้ <span className="font-bold text-gray-700 tabular-nums">{contactYesRows.length}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-rose-400" />
              <span>ติดต่อไม่ได้ <span className="font-bold text-gray-700 tabular-nums">{contactNoRows.length}</span></span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-gray-400">คลิก stage ดูรายชื่อ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Source quality — vertical grouped-bar chart, 4 bars per source side-by-side.
//   Lead (total) · จอง (booked) · มัดจำ (paid) · ติดตั้ง (installed)
// The "drop" between bars within a group = funnel conversion at a glance.
function SourceQualityChart({ sources }: { sources: DevData["sources"] }) {
  // Short labels for chart x-axis — the full "Seeker · Sen X PM" / "LINE OA ·
  // SENA Solar" form is too long to fit under a 10-column bar group, so we
  // collapse to a compact word per source. Long form still shows in the title
  // tooltip on hover.
  const SHORT_LABEL: Record<string, string> = {
    seeker_senxpm: "Sen X PM",  seeker_housing: "Housing",
    line_sena: "LINE OA",       line_agent: "LINE Agent",     line_smartify: "LINE Smartify",
    event_booth: "Event",
    smartify_app: "Smartify",   smartify_existing: "Smartify เดิม", smartify_new: "Smartify ใหม่",
    web_sena: "Website",
    fb_smartify: "FB Smartify", fb_senx: "FB SenX",
    other: "อื่นๆ",
    senxpm: "SenXPM",           walk_in: "Walk-in",
    event: "Event",             ads: "Ads",                   the1: "The1",
    web: "Web",                 refer: "แนะนำ",
    line_oa: "LINE OA",         email: "Email",               seeker: "Seeker",
  };
  // Collapse raw source strings into canonical buckets — same as the old BarList
  // so labels match the chip + channel picker; aggregate per-stage counts.
  type Bucket = { label: string; fullLabel: string; cnt: number; booked: number; paid: number; installed: number };
  const buckets = new Map<string, Bucket>();
  for (const s of sources) {
    const key = normalizeSourceKey(s.source);
    const fullLabel = getSourceStyle(s.source).label;
    const label = SHORT_LABEL[key] || fullLabel;
    const cur = buckets.get(key);
    if (cur) { cur.cnt += s.cnt; cur.booked += s.booked; cur.paid += s.paid; cur.installed += s.installed; }
    else buckets.set(key, { label, fullLabel, cnt: s.cnt, booked: s.booked, paid: s.paid, installed: s.installed });
  }
  const items = Array.from(buckets.values()).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
  const max = Math.max(...items.map(s => s.cnt), 1);
  const chartH = 180;
  const bars: { key: "cnt" | "booked" | "paid" | "installed"; color: string; label: string }[] = [
    { key: "cnt",       color: "bg-gray-400",    label: "Lead"    },
    { key: "booked",    color: "bg-blue-500",    label: "จอง"     },
    { key: "paid",      color: "bg-yellow-400",  label: "มัดจำ"   },
    { key: "installed", color: "bg-emerald-500", label: "ติดตั้ง" },
  ];

  return (
    <div>
      <div className="flex items-end gap-3 border-b border-gray-200 pb-px" style={{ height: chartH + 30 }}>
        {items.map((s, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-stretch justify-end" style={{ height: "100%" }}>
            <div className="flex items-end gap-0.5 px-0.5" style={{ height: chartH + 22 }}>
              {bars.map(b => {
                const v = s[b.key];
                const h = (v / max) * chartH;
                return (
                  <div key={b.key} className="flex-1 min-w-0 flex flex-col items-stretch justify-end">
                    <div className="text-center text-xxs font-bold font-mono tabular-nums text-gray-700 leading-none mb-1">{v}</div>
                    <div className={`${b.color}`} style={{ height: Math.max(h, v > 0 ? 2 : 0) }} title={`${b.label} ${v}`} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-1">
        {items.map((s, i) => (
          <div key={i} className="flex-1 min-w-0 text-center text-xxs text-gray-500 leading-tight px-0.5 truncate" title={s.fullLabel}>{s.label}</div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xxs text-gray-500 flex-wrap">
        {bars.map(b => (
          <div key={b.key} className="flex items-center gap-1"><div className={`w-2.5 h-2.5 rounded-sm ${b.color}`} />{b.label}</div>
        ))}
      </div>
    </div>
  );
}

// BarList — moved over from /dashboard-dev so the 5-card row above can render
// without the dev page.
function BarList({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => {
        const pct = (it.value / max) * 100;
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-gray-700 truncate">{it.label}</span>
              <span className="text-xs font-bold font-mono tabular-nums text-gray-900 ml-2">{it.value}</span>
            </div>
            <div className="h-1.5 bg-gray-100 overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Group palette mirrors LostModal's 5 categories so the chart and the picker
// read as the same taxonomy. "Other" is a synthetic bucket for free-text
// (อื่นๆ — …) plus any legacy bare values that never got a group prefix.
const LOST_GROUPS: { title: string }[] = [
  { title: "ติดต่อไม่ได้ / ข้อมูลผิด" },
  { title: "ลูกค้าไม่สนใจ"          },
  { title: "ความพร้อม"             },
  { title: "สินเชื่อ"                },
  { title: "ปิดการขายไม่สำเร็จ"      },
  { title: "อื่นๆ"                  },
];

function LostReasonsByGroup({
  items,
  rows,
  onOpenBucket,
}: {
  items: { reason: string; cnt: number }[];
  rows: LifecycleRow[];
  onOpenBucket: (title: string, rows: LifecycleRow[]) => void;
}) {
  // LostModal saves "{group_title} — {item}" (U+2014 em-dash). Split on that
  // separator; anything without the prefix lands in the synthetic "Other"
  // bucket (legacy bare values, plus the "test" / bare "อื่นๆ" rows).
  const SEP = " — ";
  const parsed = items.map(it => {
    const i = it.reason.indexOf(SEP);
    if (i === -1) return { group: "อื่นๆ", item: it.reason, cnt: it.cnt, fullReason: it.reason };
    return { group: it.reason.slice(0, i), item: it.reason.slice(i + SEP.length), cnt: it.cnt, fullReason: it.reason };
  });
  const max = Math.max(...parsed.map(p => p.cnt), 1);
  // Sort groups by their total descending so heaviest reasons appear first.
  // Empty groups are dropped here (instead of inline-returning null) so the
  // mapping below can skip the conditional check.
  const groupsWithCounts = LOST_GROUPS
    .map(g => ({ g, total: parsed.filter(p => p.group === g.title).reduce((a, b) => a + b.cnt, 0) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-3">
      {groupsWithCounts.map(({ g }) => {
        const inGroup = parsed.filter(p => p.group === g.title);
        const groupTotal = inGroup.reduce((a, b) => a + b.cnt, 0);
        const groupReasonSet = new Set(inGroup.map(p => p.fullReason));
        const groupRows = rows.filter(r => r.lost_reason !== null && groupReasonSet.has(r.lost_reason));
        return (
          <div key={g.title}>
            <button
              type="button"
              onClick={() => onOpenBucket(g.title, groupRows)}
              className="w-full flex items-center justify-between px-2 py-1 mb-1.5 rounded bg-red-200 hover:bg-red-300 cursor-pointer transition-colors"
            >
              <div className="text-xxs font-bold uppercase tracking-wider text-red-800">{g.title}</div>
              <div className="text-xs font-bold font-mono tabular-nums text-red-800">{groupTotal}</div>
            </button>
            <div className="space-y-1.5">
              {inGroup.map((p, i) => {
                const pct = (p.cnt / max) * 100;
                const itemRows = rows.filter(r => r.lost_reason === p.fullReason);
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => onOpenBucket(p.fullReason, itemRows)}
                    className="w-full text-left hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-700 truncate">{p.item}</span>
                      <span className="text-xs font-bold font-mono tabular-nums text-gray-900 ml-2">{p.cnt}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 overflow-hidden">
                      <div className="h-full bg-red-400" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

