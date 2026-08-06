"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { GSB_SOLAR_LOAN_DEFAULTS } from "@/lib/loan-defaults";
import { formatTHB, formatThaiDateShort, formatThaiTime } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";
import ModalBase from "@/components/ui/ModalBase";
import {
  balanceFinalQuotationPaymentTerm,
  getQuotationPaymentTermsTotal,
  parseQuotationPaymentTerms,
  type QuotationPaymentTerm,
} from "@/lib/quotation-terms";
import type { Lead, Package } from "./types";

type Item = {
  id?: number;
  package_item_id?: number | null;
  editorSelectionId?: number;
  source_type:
    | "package"
    | "addon"
    | "custom"
    | "addon_package"
    | "addon_package_detail"
    | "custom_group"
    | "custom_detail";
  item_name?: string;
  item_name_snapshot?: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total?: number;
  // Package id when this add-on line is a package picked from Package Master.
  source_package_id?: number;
};
type DocumentInputs = {
  recommendation_reason: string;
  loan_enabled: boolean;
  loan_bank: string;
  loan_term_months: number;
  down_payment_percent: number;
  interest_rate_year_1_2: number;
  interest_rate_year_3_plus: number;
  rate_source: string;
  rate_effective_date: string;
  current_monthly_bill: number;
  electricity_rate: number;
  production_kwh_per_kw_month: number;
  annual_degradation_percent: number;
};
type Quote = {
  id: number;
  option_no: number;
  doc_no: string;
  issue_date?: string;
  revision_no: number;
  status: string;
  package_id: number;
  package_name_snapshot: string;
  package_price_snapshot: number;
  contract_total_incl_vat: number;
  deposit_paid_amount: number;
  outstanding_amount: number;
  discount_label?: string;
  discount_type: string;
  discount_value: number;
  discount_reason?: string;
  payment_template_id?: number;
  payment_terms_json: string;
  terms_text?: string;
  note?: string;
  approval_note?: string;
  returned_by_name?: string;
  returned_by_role?: string;
  created_by_name?: string;
  created_at?: string;
  document_inputs_json?: string;
  document_snapshot_at?: string;
  approval_certified_at?: string;
  items: Item[];
};
type Template = {
  id: number;
  name: string;
  is_default: boolean;
  terms: Array<{ label: string; percent: number; due: string }>;
};
const statusLabel: Record<string, string> = {
  draft: "ฉบับร่าง",
  pending_solar_sup: "รอ Solar Sup อนุมัติ",
  pending_sales_sup: "รอ Sale Sup อนุมัติ",
  pending_approval: "รอ Sale Sup อนุมัติ",
  approved: "อนุมัติแล้ว",
  changes_required: "ส่งกลับแก้ไข",
  cancelled: "ยกเลิกแล้ว",
};
const emptyItem = (): Item => ({
  source_type: "custom",
  item_name: "",
  quantity: 1,
  unit: "ชุด",
  unit_price: 0,
});
// Local-time YYYY-MM-DD for the quotation date input default (never UTC —
// toISOString would roll to the next day for evening edits in +07:00).
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const formatPackageSpecs = (pkg: Package) =>
  `ขนาด ${pkg.kwp} kWp · ${pkg.phase > 0 ? `${pkg.phase} เฟส` : "ทุกเฟส"}`;

export default function QuotationBuilder({
  lead,
  packages,
  refresh,
  salesNote,
  onSalesNoteChange,
}: {
  lead: Lead;
  packages: Package[];
  refresh: () => Promise<unknown> | void;
  salesNote: string;
  onSalesNoteChange: (value: string) => void;
}) {
  const { activeRoles } = useActiveRoles();
  const dialog = useDialog();
  // In-app "ส่งกลับให้แก้ไข" reason modal (replaces the native window.prompt).
  const [returnModal, setReturnModal] = useState<{ id: number } | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const canReviewQuotation = (status: string) =>
    status === "pending_solar_sup"
      ? hasRole(activeRoles, "admin", "solar_sup")
      : ["pending_sales_sup", "pending_approval"].includes(status) &&
        hasRole(activeRoles, "admin", "sales_sup");
  const isPendingQuotation = (status: string) =>
    ["pending_solar_sup", "pending_sales_sup", "pending_approval"].includes(
      status,
    );
  const [quotes, setQuotes] = useState<Quote[]>([]);
  // Gate the empty "+ สร้างใบเสนอราคา" placeholders behind the first fetch so
  // an existing quote never flashes as an empty create-card while loading.
  const [loaded, setLoaded] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The quote whose PDF is being generated (puppeteer takes a few seconds).
  // Drives the per-button spinner so a click gives immediate feedback instead
  // of sitting silent while the server renders.
  const confirmedDeposit =
    lead.pre_survey_fee_type === "free"
      ? 0
      : lead.payment_confirmed
        ? Math.max(0, Number(lead.pre_total_price) || 0)
        : 0;
  const load = useCallback(async () => {
    try {
      setQuotes(await apiFetch(`/api/leads/${lead.id}/quotations`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดใบเสนอราคาไม่สำเร็จ");
    } finally {
      setLoaded(true);
    }
  }, [lead.id]);
  useEffect(() => {
    load();
    apiFetch("/api/quotation-templates")
      .then(setTemplates)
      .catch(() => undefined);
  }, [load]);
  const latest = useMemo(() => {
    const map = new Map<number, Quote>();
    for (const q of quotes) {
      if (q.status === "cancelled") continue;
      if (!map.has(q.option_no)) map.set(q.option_no, q);
    }
    return map;
  }, [quotes]);
  const currentQuotes = useMemo(() => Array.from(latest.values()), [latest]);
  const allCurrentQuotesApproved =
    currentQuotes.length > 0 &&
    currentQuotes.every((quote) => quote.status === "approved");
  const readyQuotes = currentQuotes.filter((q) =>
    ["draft", "changes_required"].includes(q.status),
  );
  const act = async (id: number, action: string, note = "", status = "") => {
    if (action === "approve") {
      const ok = await dialog.confirm({
        title: "ยืนยันการอนุมัติ",
        variant: "success",
        confirmText: "อนุมัติ",
        message:
          status === "pending_solar_sup"
            ? "ยืนยันว่า Solar Sup ตรวจเอกสารแล้ว และส่งต่อให้ Sale Sup อนุมัติขั้นสุดท้าย"
            : "ยืนยันว่าได้ตรวจสอบและรับรองข้อมูล Survey, Package, ราคา, เงื่อนไขชำระเงิน และผลคำนวณทั้งชุดแล้ว",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/quotations/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note, certify: action === "approve" }),
      });
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  // Navigate straight to the API instead of fetching a blob: a blob: URL drops
  // the server's Content-Disposition, so the viewer's Download button saved the
  // file under a random name. Going direct keeps
  // "SSR-QT-26-0003_ชื่อลูกค้า.pdf". Opening in the same tick as the click also
  // avoids the popup blocker (the old "first click does nothing" bug).
  const openPdf = (id: number, download = false) => {
    const params = new URLSearchParams();
    if (download) params.set("download", "1");
    const uid =
      typeof window !== "undefined" ? window.localStorage.getItem("userId") : null;
    if (uid) params.set("user_id", uid); // header auth isn't available on a plain navigation
    const query = params.toString();
    const url = `/api/quotation-pdf/${id}${query ? `?${query}` : ""}`;
    const tab = window.open(url, "_blank");
    if (tab) tab.opener = null;
    else window.location.href = url;
  };
  // Draft-only hard delete. Backend guards to status='draft' + admin/owner and
  // this button is shown only for drafts, so it never appears on a sent quote.
  const remove = async (id: number) => {
    const ok = await dialog.confirm({
      title: "ลบฉบับร่าง",
      variant: "danger",
      confirmText: "ลบ",
      message: "ลบใบเสนอราคาฉบับร่างนี้ถาวร? กู้คืนไม่ได้",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/quotations/${id}`, { method: "DELETE" });
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const submitAll = async () => {
    if (!readyQuotes.length) return;
    setBusy(true);
    setError("");
    try {
      for (const q of readyQuotes)
        await apiFetch(`/api/quotations/${q.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit" }),
        });
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งขออนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
            ใบเสนอราคา{" "}
            <span className="font-normal normal-case text-gray-400">
              (สูงสุด 3 ฉบับ — ลูกค้าจะเลือก 1 ฉบับใน Order step)
            </span>{" "}
            <span className="text-red-500">*</span>
          </div>
        </div>
        <div className="text-xxs text-gray-400 text-right">
          อนุมัติให้ครบทุกฉบับ แล้วส่งให้ทีมขายเลือกใน Step 4
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {!loaded
          ? [1, 2, 3].map((n) => (
              <div
                key={`skeleton-${n}`}
                className="rounded-xl border border-gray-200 bg-white p-4 min-h-[342px] flex flex-col shadow-sm animate-pulse"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-14 rounded bg-gray-200" />
                    <div className="h-2 w-24 rounded bg-gray-100" />
                  </div>
                  <div className="h-7 w-16 rounded-full bg-gray-100" />
                </div>
                <div className="mt-4 h-20 rounded-xl bg-gray-100" />
                <div className="mt-2 h-6 w-40 rounded-full bg-gray-100" />
                <div className="mt-auto pt-4 flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-gray-100" />
                  <div className="h-6 w-24 rounded bg-gray-200" />
                </div>
                <div className="mt-3 h-9 rounded-lg bg-gray-100" />
              </div>
            ))
          : [1, 2, 3].map((option) => {
          const q = latest.get(option);
          const pkg = q ? packages.find((p) => p.id === q.package_id) : null;
          const extras =
            q?.items.filter(
              (i) =>
                i.source_type !== "package" &&
                i.source_type !== "addon_package_detail" &&
                i.source_type !== "custom_detail",
            ) || [];
          return q ? (
            <article
              key={option}
              className="rounded-xl border border-gray-200 bg-white p-4 min-h-[342px] flex flex-col shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-cyan-400 text-white flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-gray-900">
                    ชุด {option}
                  </div>
                  <div className="text-xxs text-gray-400 font-mono mt-0.5 truncate">
                    {q.doc_no}
                    {q.revision_no > 0 ? ` · Rev.${q.revision_no}` : ""}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-sm font-bold leading-none whitespace-nowrap ${q.status === "approved" ? "bg-emerald-50 text-emerald-700" : isPendingQuotation(q.status) ? "bg-amber-50 text-amber-700" : q.status === "changes_required" ? "bg-red-50 text-red-700" : "bg-violet-50 text-violet-700"}`}
                >
                  {statusLabel[q.status]}
                </span>
              </div>
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                <div className="text-xxs font-semibold text-gray-400">
                  แพ็กเกจหลัก
                </div>
                {/* ชื่อ package เต็ม — ไม่ตัดบรรทัด (ชื่อยาวขึ้นบรรทัดใหม่ได้) */}
                <div className="mt-1 font-bold text-sm text-gray-900 break-words">
                  {q.package_name_snapshot}
                </div>
                <div className="mt-1 text-xxs text-gray-500">
                  {pkg
                    ? `${pkg.phase || "-"} เฟส · ${pkg.inverter_brand || "ไม่ระบุ Inverter"}${pkg.has_battery ? ` · Battery ${pkg.battery_kwh || ""} kWh` : ""}`
                    : "Snapshot จาก Package Master"}
                </div>
                {/* รายการเสริม (package เพิ่มเติม / อุปกรณ์อื่น) — บอกให้ครบว่าใบนี้มีอะไรบ้าง */}
                {extras.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-0.5">
                    <div className="text-xxs font-semibold text-gray-400">
                      รายการเสริม ({extras.length})
                    </div>
                    {extras.map((item, index) => (
                      <div key={item.id || index} className="text-xxs text-gray-600 break-words">
                        + {item.item_name_snapshot || item.item_name}
                        {item.quantity ? ` ${item.quantity} ${item.unit || ""}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* ผู้จัดทำ + วันเวลาที่สร้าง — ใต้กล่องแพ็กเกจ เต็มความกว้างการ์ด */}
              {q.created_by_name && (
                <div className="mt-2 text-xxs text-gray-500 break-words">
                  ผู้จัดทำ: {q.created_by_name}
                  {q.created_at
                    ? ` · ${formatThaiDateShort(q.created_at)} ${formatThaiTime(q.created_at)} น.`
                    : ""}
                </div>
              )}
              {q.approval_note && (
                <div className="mt-2 text-xs text-red-600 line-clamp-2">
                  ส่งกลับโดย {q.returned_by_role || "ผู้อนุมัติ"}
                  {q.returned_by_name ? ` (${q.returned_by_name})` : ""}: {q.approval_note}
                </div>
              )}
              <div className="mt-auto pt-4 flex items-end justify-between">
                <span className="text-xxs text-gray-400">ยอดที่ต้องชำระ</span>
                <div className="text-right">
                  <b className="text-xl text-gray-900 tabular-nums">
                    {formatTHB(q.outstanding_amount)}
                  </b>{" "}
                  <span className="text-xxs font-semibold">บาท</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {["draft", "changes_required"].includes(q.status) ? (
                  <div className="col-span-3 flex gap-2">
                    <button
                      onClick={() => setEditing(option)}
                      className="h-9 px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs font-semibold whitespace-nowrap"
                    >
                      ✎ แก้ไข
                    </button>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="flex-1 h-9 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                    {q.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => remove(q.id)}
                        aria-label="ลบฉบับร่าง"
                        title="ลบฉบับร่าง"
                        className="h-9 px-3 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : isPendingQuotation(q.status) && canReviewQuotation(q.status) ? (
                  <>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="h-9 rounded-lg border border-gray-200 text-xs font-semibold"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setReturnNote("");
                        setReturnModal({ id: q.id });
                      }}
                      className="h-9 rounded-lg bg-red-50 text-red-700 text-xs font-semibold"
                    >
                      ส่งกลับ
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => act(q.id, "approve", "", q.status)}
                      className="h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      {q.status === "pending_solar_sup"
                        ? "อนุมัติส่งต่อ"
                        : "อนุมัติ"}
                    </button>
                  </>
                ) : q.status === "approved" ? (
                  <>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="col-span-2 h-9 rounded-lg border border-gray-200 text-xs font-semibold"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => act(q.id, "revise")}
                      className="h-9 rounded-lg border border-gray-200 text-xs font-semibold"
                    >
                      Revision
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="col-span-3 h-9 rounded-lg border border-gray-200 text-xs font-semibold"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                  </>
                )}
              </div>
            </article>
          ) : (
            <article
              key={option}
              className="rounded-xl border border-dashed border-violet-300 bg-white/40 min-h-[342px] p-5 flex flex-col items-center justify-center text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center text-4xl font-light">
                +
              </div>
              <h3 className="mt-3 text-base font-bold text-gray-900">
                สร้างใบเสนอราคาชุดที่ {option}
              </h3>
              <p className="mt-1 text-xs text-gray-400">
                เลือกแพ็กเกจหลักและรายการอื่นสำหรับใบเสนอราคาชุดนี้
              </p>
              <button
                onClick={() => setEditing(option)}
                className="mt-5 h-10 px-5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
              >
                + สร้างใบเสนอราคา
              </button>
            </article>
          );
        })}
      </div>
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">
          บันทึกถึงฝ่ายขาย
        </label>
        <textarea
          value={salesNote}
          onChange={(e) => onSalesNoteChange(e.target.value)}
          placeholder="รายละเอียดใบเสนอราคา, หมายเหตุ..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>
      {currentQuotes.length > 0 && (
        <div>
          <button
            disabled={
              busy || (!allCurrentQuotesApproved && readyQuotes.length === 0)
            }
            onClick={
              allCurrentQuotesApproved
                ? () => act(currentQuotes[0].id, "handoff_to_sales")
                : submitAll
            }
            className="w-full h-11 rounded-lg bg-gradient-to-r from-primary to-cyan-500 text-white text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allCurrentQuotesApproved
              ? "▷ ส่งใบเสนอราคาให้ทีมขาย"
              : readyQuotes.length > 0
                ? `▷ ส่งขออนุมัติใบเสนอราคา${readyQuotes.length > 1 ? ` ${readyQuotes.length} ฉบับ` : ""}`
                : `รออนุมัติใบเสนอราคา ${currentQuotes.filter((quote) => quote.status === "approved").length}/${currentQuotes.length} ฉบับ`}
          </button>
        </div>
      )}
      {editing !== null && (
        <QuotationEditor
          optionNo={editing}
          quote={latest.get(editing)}
          packages={packages}
          templates={templates}
          lead={lead}
          confirmedDeposit={confirmedDeposit}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {returnModal && (
        <ModalBase
          title="ส่งกลับให้แก้ไข"
          size="md"
          onClose={() => setReturnModal(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReturnModal(null)}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!returnNote.trim() || busy}
                onClick={() => {
                  const id = returnModal.id;
                  const note = returnNote.trim();
                  setReturnModal(null);
                  act(id, "changes_required", note);
                }}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ส่งกลับ
              </button>
            </div>
          }
        >
          <p className="text-xs text-gray-600">
            ใบเสนอราคาจะถูกส่งกลับให้ผู้จัดทำแก้ไข กรุณาระบุเหตุผล
          </p>
          <label className="block text-xs font-semibold text-gray-700 mt-4 mb-1">
            เหตุผล <span className="text-red-500">*</span>
          </label>
          <textarea
            value={returnNote}
            onChange={(e) => setReturnNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder="เช่น ราคาไม่ถูกต้อง / เงื่อนไขชำระเงินต้องแก้"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-red-400 resize-none"
          />
        </ModalBase>
      )}
    </div>
  );
}

function QuotationEditor({
  optionNo,
  quote,
  packages,
  templates,
  lead,
  confirmedDeposit,
  onClose,
  onSaved,
}: {
  optionNo: number;
  quote?: Quote;
  packages: Package[];
  templates: Template[];
  lead: Lead;
  confirmedDeposit: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const defaultTemplate = templates.find((t) => t.is_default) || templates[0];
  // Default to unselected ("เลือก Package") — a package is optional now
  // (customer may buy add-ons only), so we never auto-pick the first one.
  const [packageId, setPackageId] = useState(quote?.package_id || 0);
  const savedPackageItems =
    quote?.items
      ?.filter((item) => item.source_type === "package")
      .map((item) => ({
        ...item,
        item_name: item.item_name_snapshot || item.item_name || "",
        unit_price: 0,
      })) || [];
  const [packageItems, setPackageItems] = useState<Item[]>(savedPackageItems);
  const [packageItemsSourceId, setPackageItemsSourceId] = useState(
    savedPackageItems.length > 0 ? quote?.package_id || 0 : 0,
  );
  const [packageItemsLoading, setPackageItemsLoading] = useState(false);
  const [showPackageItems, setShowPackageItems] = useState(false);
  const [shownAdditionalPackageItems, setShownAdditionalPackageItems] =
    useState<Record<number, boolean>>({});
  const initialAdditionalState = (() => {
    const editorItems: Item[] = [];
    const selectors: Array<{ id: number; value: string }> = [];
    const packageDetails: Record<number, Item[]> = {};
    let activeSelectorId: number | null = null;
    for (const savedItem of quote?.items || []) {
      if (savedItem.source_type === "package") continue;
      if (savedItem.source_type === "addon_package") {
        const selectorId = selectors.length + 1;
        const sourcePackageId = Number(savedItem.source_package_id) || 0;
        const selectedPackage = packages.find(
          (candidate) => candidate.id === sourcePackageId,
        );
        selectors.push({ id: selectorId, value: String(sourcePackageId || "") });
        editorItems.push({
          ...savedItem,
          source_type: "custom",
          editorSelectionId: selectorId,
          source_package_id: sourcePackageId || undefined,
          item_name: selectedPackage
            ? `Package เพิ่มเติม: ${selectedPackage.name}`
            : savedItem.item_name_snapshot || savedItem.item_name,
          quantity:
            Number(savedItem.unit_price) > 0
              ? Math.max(
                  1,
                  Number(savedItem.line_total) / Number(savedItem.unit_price),
                )
              : 1,
        });
        packageDetails[selectorId] = [
          {
            ...savedItem,
            item_name: savedItem.item_name_snapshot || savedItem.item_name,
            unit_price: 0,
          },
        ];
        activeSelectorId = selectorId;
        continue;
      }
      if (savedItem.source_type === "custom_group") {
        const selectorId = selectors.length + 1;
        selectors.push({ id: selectorId, value: "custom" });
        editorItems.push({
          ...savedItem,
          source_type: "custom",
          editorSelectionId: selectorId,
          item_name: savedItem.item_name_snapshot || savedItem.item_name,
        });
        packageDetails[selectorId] = [];
        activeSelectorId = selectorId;
        continue;
      }
      if (
        (savedItem.source_type === "addon_package_detail" ||
          savedItem.source_type === "custom_detail") &&
        activeSelectorId !== null
      ) {
        packageDetails[activeSelectorId].push({
          ...savedItem,
          item_name: savedItem.item_name_snapshot || savedItem.item_name,
          unit_price: 0,
        });
        continue;
      }
      activeSelectorId = null;
      editorItems.push({
        ...savedItem,
        source_type: "custom",
        item_name: savedItem.item_name_snapshot || savedItem.item_name,
      });
    }
    if (selectors.length === 0) selectors.push({ id: 1, value: "" });
    return { editorItems, selectors, packageDetails };
  })();
  const [items, setItems] = useState<Item[]>(initialAdditionalState.editorItems);
  const [additionalItemSelectors, setAdditionalItemSelectors] = useState(
    initialAdditionalState.selectors,
  );
  const [additionalPackageItems, setAdditionalPackageItems] = useState<
    Record<number, Item[]>
  >(initialAdditionalState.packageDetails);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    quote?.discount_type === "percent" ? "percent" : "amount",
  );
  const [discountValue, setDiscountValue] = useState(
    Math.max(0, Number(quote?.discount_value) || 0),
  );
  const [discountLabel, setDiscountLabel] = useState(
    quote?.discount_label || "",
  );
  const discountReason = "";
  const isFreeSurvey = lead.pre_survey_fee_type === "free";
  const [deposit, setDeposit] = useState(
    isFreeSurvey
      ? 0
      : confirmedDeposit > 0
      ? confirmedDeposit
      : Math.max(0, Number(quote?.deposit_paid_amount) || 0),
  );
  const [templateId, setTemplateId] = useState<number | undefined>(
    quote?.payment_template_id || defaultTemplate?.id,
  );
  const [terms, setTerms] = useState<QuotationPaymentTerm[]>(() =>
    balanceFinalQuotationPaymentTerm(
      parseQuotationPaymentTerms(quote?.payment_terms_json),
    ),
  );
  const [termsText, setTermsText] = useState(quote?.terms_text || "");
  // Quotation date shown on the document (issue_date). Editable; defaults to
  // today for a new quote, or the saved value when editing.
  const [issueDate, setIssueDate] = useState(
    quote?.issue_date ? String(quote.issue_date).slice(0, 10) : todayIso(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [documentInputs] = useState<DocumentInputs>(() => {
    let saved: Partial<DocumentInputs> = {};
    try {
      saved = JSON.parse(quote?.document_inputs_json || "{}");
    } catch {}
    return {
      recommendation_reason: saved.recommendation_reason || "",
      loan_enabled:
        saved.loan_enabled ?? GSB_SOLAR_LOAN_DEFAULTS.loan_enabled,
      loan_bank:
        saved.loan_bank ||
        lead.finance_loan_bank ||
        lead.finance_bank ||
        GSB_SOLAR_LOAN_DEFAULTS.loan_bank,
      loan_term_months: Number(
        saved.loan_term_months ||
          lead.finance_months ||
          GSB_SOLAR_LOAN_DEFAULTS.loan_term_months,
      ),
      down_payment_percent: Number(
        saved.down_payment_percent ??
          GSB_SOLAR_LOAN_DEFAULTS.down_payment_percent,
      ),
      interest_rate_year_1_2: Number(
        saved.interest_rate_year_1_2 ??
          GSB_SOLAR_LOAN_DEFAULTS.interest_rate_year_1_2,
      ),
      interest_rate_year_3_plus: Number(
        saved.interest_rate_year_3_plus ??
          GSB_SOLAR_LOAN_DEFAULTS.interest_rate_year_3_plus,
      ),
      rate_source:
        saved.rate_source || GSB_SOLAR_LOAN_DEFAULTS.rate_source,
      rate_effective_date:
        saved.rate_effective_date ||
        GSB_SOLAR_LOAN_DEFAULTS.rate_effective_date,
      current_monthly_bill: Number(
        saved.current_monthly_bill ||
          lead.survey_monthly_bill ||
          lead.pre_monthly_bill ||
          lead.monthly_bill_max ||
          0,
      ),
      electricity_rate: Number(saved.electricity_rate || 5),
      production_kwh_per_kw_month: Number(
        saved.production_kwh_per_kw_month || 120,
      ),
      annual_degradation_percent: Number(
        saved.annual_degradation_percent ?? 0.5,
      ),
    };
  });
  useEffect(() => {
    if (!packageId) {
      setPackageItems([]);
      setPackageItemsSourceId(0);
      setPackageItemsLoading(false);
      return;
    }
    if (packageItemsSourceId === packageId) return;
    let cancelled = false;
    setPackageItemsLoading(true);
    apiFetch(`/api/packages/${packageId}/items`)
      .then((rows: Item[]) => {
        if (cancelled) return;
        setPackageItems(
          rows.map((item) => ({
            ...item,
            package_item_id: item.id,
            item_name: item.item_name_snapshot || item.item_name || "",
            unit_price: 0,
          })),
        );
        setPackageItemsSourceId(packageId);
      })
      .catch(() => {
        if (cancelled) return;
        setPackageItems([]);
        setPackageItemsSourceId(packageId);
      })
      .finally(() => {
        if (!cancelled) setPackageItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packageId, packageItemsSourceId]);
  useEffect(() => {
    if (quote || templateId || !defaultTemplate) return;
    setTemplateId(defaultTemplate.id);
  }, [defaultTemplate, quote, templateId]);
  useEffect(() => {
    if (isFreeSurvey) setDeposit(0);
    else if (confirmedDeposit > 0) setDeposit(confirmedDeposit);
  }, [confirmedDeposit, isFreeSurvey]);
  const pkg = packages.find((p) => p.id === packageId);
  const packageGroups = [
    {
      label: "แพ็กเกจมาตรฐาน (Solar Rooftop)",
      icon: "☀️",
      items: packages.filter(
        (p) => !p.has_battery && !p.is_upgrade && !p.is_other,
      ),
    },
    {
      label: "แพ็กเกจเพิ่มขนาดระบบ (Scale Up)",
      icon: "📈",
      items: packages.filter((p) => p.is_upgrade && !p.is_other),
    },
    {
      label: "แพ็กเกจแบตเตอรี่ / Hybrid",
      icon: "🔋",
      items: packages.filter(
        (p) => p.has_battery && !p.is_upgrade && !p.is_other,
      ),
    },
    {
      label: "Package อื่นๆ",
      icon: "📦",
      items: packages.filter((p) => p.is_other),
    },
  ].filter((group) => group.items.length > 0);
  const extras = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );
  const subtotal = Number(pkg?.price || 0) + extras;
  const discountAmount =
    Math.round(
      Math.min(
        subtotal,
        discountType === "percent"
          ? (subtotal * Math.min(100, discountValue)) / 100
          : discountValue,
      ) * 100,
    ) / 100;
  const discountPercent =
    subtotal > 0 ? Math.round((discountAmount / subtotal) * 10000) / 100 : 0;
  const total = Math.max(0, subtotal - discountAmount);
  const outstanding = Math.max(0, total - deposit);
  const updateItem = (idx: number, patch: Partial<Item>) =>
    setItems((v) => v.map((i, n) => (n === idx ? { ...i, ...patch } : i)));
  const updatePackageItem = (idx: number, patch: Partial<Item>) =>
    setPackageItems((current) =>
      current.map((item, index) =>
        index === idx ? { ...item, ...patch } : item,
      ),
    );
  const addPackageItem = () => {
    setPackageItems((current) => [
      ...current,
      {
        package_item_id: null,
        source_type: "package",
        item_name: "",
        quantity: 1,
        unit: "SET",
        unit_price: 0,
      },
    ]);
    setShowPackageItems(true);
  };
  const removePackageItem = (idx: number) => {
    if (idx === 0) return;
    setPackageItems((current) =>
      current.filter((_, index) => index !== idx),
    );
  };
  const restorePackageItems = () => {
    setPackageItemsSourceId(0);
    setShowPackageItems(true);
  };
  const termsPercentTotal = getQuotationPaymentTermsTotal(terms);
  const updatePaymentTerm = (
    idx: number,
    patch: Partial<QuotationPaymentTerm>,
  ) =>
    setTerms((current) => {
      const updated = current.map((term, index) =>
        index === idx ? { ...term, ...patch } : term,
      );
      return "percent" in patch
        ? balanceFinalQuotationPaymentTerm(updated)
        : updated;
    });
  const getPaymentTermAmount = (percent: number, idx: number) => {
    if (!Number.isFinite(percent)) return Number.NaN;
    if (idx === terms.length - 1) {
      const allocatedAmount = terms.slice(0, -1).reduce((sum, term) => {
        if (!Number.isFinite(term.percent)) return sum;
        return (
          sum + Math.round(((outstanding * term.percent) / 100) * 100) / 100
        );
      }, 0);
      return Math.round(Math.max(0, outstanding - allocatedAmount) * 100) / 100;
    }
    return Math.round(((outstanding * percent) / 100) * 100) / 100;
  };
  const updatePaymentTermAmount = (idx: number, value: string) => {
    if (value === "") {
      updatePaymentTerm(idx, { percent: Number.NaN });
      return;
    }
    const amount = Math.min(outstanding, Math.max(0, Number(value) || 0));
    const percent =
      outstanding > 0
        ? Math.round(((amount / outstanding) * 100) * 100_000_000) /
          100_000_000
        : 0;
    updatePaymentTerm(idx, { percent });
  };
  const addPaymentTerm = () =>
    setTerms((current) =>
      balanceFinalQuotationPaymentTerm([
        ...current,
        {
          label: `งวดที่ ${current.length + 1} ชำระ`,
          percent: 0,
          due: "",
        },
      ]),
    );
  const removePaymentTerm = (idx: number) =>
    setTerms((current) =>
      balanceFinalQuotationPaymentTerm(
        current
          .filter((_, index) => index !== idx)
          .map((term, index) => ({
            ...term,
            label: /^งวดที่ \d+ ชำระ$/.test(term.label)
              ? `งวดที่ ${index + 1} ชำระ`
              : term.label,
          })),
      ),
    );
  const addAdditionalItemSelector = () =>
    setAdditionalItemSelectors((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((selector) => selector.id)) + 1,
        value: "",
      },
    ]);
  const updateAdditionalItemSelection = (selectorId: number, value: string) => {
    setShownAdditionalPackageItems((current) => ({
      ...current,
      [selectorId]: false,
    }));
    setAdditionalItemSelectors((current) =>
      current.map((selector) =>
        selector.id === selectorId ? { ...selector, value } : selector,
      ),
    );
    setItems((current) => {
      const linkedItems = new Map(
        current
          .filter((item) => item.editorSelectionId !== undefined)
          .map((item) => [item.editorSelectionId, item]),
      );
      if (!value) {
        linkedItems.delete(selectorId);
      } else if (value === "custom") {
        linkedItems.set(selectorId, {
          ...emptyItem(),
          editorSelectionId: selectorId,
        });
      } else {
        const selectedPackage = packages.find(
          (candidate) => candidate.id === Number(value),
        );
        if (!selectedPackage || selectedPackage.id === packageId) return current;
        linkedItems.set(selectorId, {
          source_type: "custom",
          editorSelectionId: selectorId,
          item_name: `Package เพิ่มเติม: ${selectedPackage.name}`,
          quantity: 1,
          unit: "ชุด",
          unit_price: Number(selectedPackage.price) || 0,
          source_package_id: selectedPackage.id,
        });
      }
      return [
        ...current.filter((item) => item.editorSelectionId === undefined),
        ...additionalItemSelectors.flatMap((selector) => {
          const item = linkedItems.get(selector.id);
          return item ? [item] : [];
        }),
      ];
    });
    if (!value) {
      setAdditionalPackageItems((current) => {
        const next = { ...current };
        delete next[selectorId];
        return next;
      });
      return;
    }
    if (value === "custom") {
      setAdditionalPackageItems((current) => ({
        ...current,
        [selectorId]: [],
      }));
      return;
    }
    apiFetch(`/api/packages/${Number(value)}/items`)
      .then((rows: Item[]) =>
        setAdditionalPackageItems((current) => ({
          ...current,
          [selectorId]: rows.map((item) => ({
            ...item,
            package_item_id: item.id,
            source_type: "addon_package_detail",
            item_name: item.item_name_snapshot || item.item_name || "",
            unit_price: 0,
          })),
        })),
      )
      .catch(() =>
        setAdditionalPackageItems((current) => ({
          ...current,
          [selectorId]: [],
        })),
      );
  };
  const removeAdditionalItemSelector = (selectorId: number) => {
    setAdditionalItemSelectors((current) =>
      current.length === 1
        ? current.map((selector) => ({ ...selector, value: "" }))
        : current.filter((selector) => selector.id !== selectorId),
    );
    setItems((current) =>
      current.filter((item) => item.editorSelectionId !== selectorId),
    );
    setAdditionalPackageItems((current) => {
      const next = { ...current };
      delete next[selectorId];
      return next;
    });
    setShownAdditionalPackageItems((current) => {
      const next = { ...current };
      delete next[selectorId];
      return next;
    });
  };
  const updateAdditionalSelectorItem = (
    selectorId: number,
    patch: Partial<Item>,
  ) =>
    setItems((current) =>
      current.map((item) =>
        item.editorSelectionId === selectorId ? { ...item, ...patch } : item,
      ),
    );
  const removeAdditionalItem = (idx: number) => {
    const selectorId = items[idx]?.editorSelectionId;
    setItems((current) => current.filter((_, index) => index !== idx));
    if (selectorId === undefined) return;
    setAdditionalItemSelectors((current) =>
      current.map((selector) =>
        selector.id === selectorId ? { ...selector, value: "" } : selector,
      ),
    );
  };
  const updateAdditionalPackageItem = (
    selectorId: number,
    itemIndex: number,
    patch: Partial<Item>,
  ) =>
    setAdditionalPackageItems((current) => ({
      ...current,
      [selectorId]: (current[selectorId] || []).map((item, index) =>
        index === itemIndex ? { ...item, ...patch } : item,
      ),
    }));
  const addAdditionalPackageItem = (selectorId: number) =>
    setAdditionalPackageItems((current) => ({
      ...current,
      [selectorId]: [
        ...(current[selectorId] || []),
        {
          package_item_id: null,
          source_type: "addon_package_detail",
          item_name: "",
          quantity: 1,
          unit: "SET",
          unit_price: 0,
        },
      ],
    }));
  const removeAdditionalPackageItem = (
    selectorId: number,
    itemIndex: number,
  ) => {
    const selector = additionalItemSelectors.find(
      (item) => item.id === selectorId,
    );
    if (selector?.value !== "custom" && itemIndex === 0) return;
    setAdditionalPackageItems((current) => ({
      ...current,
      [selectorId]: (current[selectorId] || []).filter(
        (_, index) => index !== itemIndex,
      ),
    }));
  };
  const restoreAdditionalPackageItems = (selectorId: number) => {
    const selector = additionalItemSelectors.find(
      (item) => item.id === selectorId,
    );
    if (!selector?.value || selector.value === "custom") return;
    apiFetch(`/api/packages/${Number(selector.value)}/items`)
      .then((rows: Item[]) =>
        setAdditionalPackageItems((current) => ({
          ...current,
          [selectorId]: rows.map((item) => ({
            ...item,
            package_item_id: item.id,
            source_type: "addon_package_detail",
            item_name: item.item_name_snapshot || item.item_name || "",
            unit_price: 0,
          })),
        })),
      )
      .catch(() => undefined);
  };
  const serializeAdditionalItems = () =>
    items.flatMap((item) => {
      const selectorId = item.editorSelectionId;
      if (!selectorId) return [item];
      const packageDetailItems = additionalPackageItems[selectorId] || [];
      if (packageDetailItems.length === 0) return [item];
      if (!item.source_package_id) {
        return [
          {
            ...item,
            source_type: "custom_group" as const,
            line_total:
              (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
          },
          ...packageDetailItems.map((detailItem) => ({
            ...detailItem,
            source_type: "custom_detail" as const,
            unit_price: 0,
            line_total: 0,
          })),
        ];
      }
      const [firstItem, ...detailItems] = packageDetailItems;
      return [
        {
          ...firstItem,
          source_type: "addon_package" as const,
          source_package_id: item.source_package_id,
          unit_price: Number(item.unit_price) || 0,
          line_total:
            (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
        },
        ...detailItems.map((detailItem) => ({
          ...detailItem,
          source_type: "addon_package_detail" as const,
          source_package_id: item.source_package_id,
          unit_price: 0,
          line_total: 0,
        })),
      ];
    });
  const previewQuotation = async () => {
    if (!pkg && items.length === 0) {
      setError("กรุณาเลือก Package หลัก หรือเพิ่มรายการอย่างน้อย 1 รายการก่อนดูตัวอย่าง");
      return;
    }
    setError("");
    // Same popup-blocker rule as openPdf: claim the tab during the click.
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.write(
        '<!doctype html><meta charset="utf-8"><title>กำลังสร้างตัวอย่าง…</title><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569">กำลังสร้างตัวอย่าง…</body>',
      );
    }
    try {
      const response = await fetch("/api/quotation-pdf/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getUserIdHeader() },
        body: JSON.stringify({
          lead,
          package: pkg,
          docNo: quote?.doc_no,
          issueDate,
          allItems: [
            ...packageItems.map((item) => ({
              ...item,
              source_type: "package",
              item_name_snapshot: item.item_name,
            })),
            ...serializeAdditionalItems(),
          ],
          discountLabel,
          deposit,
          subtotal,
          total,
          outstanding,
          terms,
          termsText,
          documentInputs,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "สร้างตัวอย่างไม่สำเร็จ");
      }
      const { token } = await response.json();
      const previewUrl = `/quotation-preview/preview-${token}`;
      if (tab) tab.location.href = previewUrl;
      else window.location.href = previewUrl;
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "สร้างตัวอย่างไม่สำเร็จ");
    }
  };
  const save = async () => {
    if (!packageId && items.length === 0) {
      setError("กรุณาเลือก Package หลัก หรือเพิ่มรายการอย่างน้อย 1 รายการ");
      return;
    }
    if (documentInputs.current_monthly_bill <= 0) {
      setError("กรุณาระบุค่าไฟปัจจุบันจากข้อมูลจริง");
      return;
    }
    if (termsPercentTotal !== 100) {
      setError(`ยอดรวมงวดชำระเงินต้องเท่ากับ 100% (ปัจจุบัน ${termsPercentTotal}%)`);
      return;
    }
    if (issueDate > todayIso()) {
      setError("วันที่ใบเสนอราคาต้องไม่เป็นวันที่ล่วงหน้า");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        option_no: optionNo,
        package_id: packageId || null,
        package_items: packageItems,
        issue_date: issueDate,
        items: serializeAdditionalItems(),
        discount_type: discountType,
        discount_value: discountValue,
        discount_label: discountLabel,
        discount_reason: discountReason,
        deposit_paid_amount: deposit,
        payment_template_id: templateId,
        payment_terms: terms,
        terms_text: termsText,
        document_inputs: documentInputs,
      };
      await apiFetch(
        quote
          ? `/api/quotations/${quote.id}`
          : `/api/leads/${lead.id}/quotations`,
        {
          method: quote ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };
  const fieldClass =
    "min-h-[46px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-300 hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";
  const compactFieldClass =
    "min-h-[46px] w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-800 outline-none transition-colors placeholder:text-gray-300 hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/35 p-3 backdrop-blur-[1px] md:p-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-slate-900/20">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white via-white to-primary/5 p-4">
          <div>
            <b className="text-sm text-gray-900">ใบเสนอราคา ชุด {optionNo}</b>
            <div className="mt-0.5 text-xs text-gray-500">
              {quote
                ? `แก้ไข ${quote.doc_no}`
                : "เลขเอกสารจะสร้างอัตโนมัติ SSR-QT-YY-XXXX"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 bg-slate-50/40 p-4 md:p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <section className="rounded-2xl border border-primary/15 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                1
              </span>
              <div>
                <h3 className="text-sm font-bold text-gray-800">แพ็กเกจหลัก</h3>
                <p className="text-xxs text-gray-500">
                  เลือกชุดอุปกรณ์และบริการหลัก
                </p>
              </div>
            </div>
            <label className="text-xs font-semibold text-gray-500">
              Package หลัก
            </label>
            <select
              value={packageId}
              onChange={(e) => {
                setPackageId(Number(e.target.value));
                setShowPackageItems(false);
              }}
              className={`mt-1 ${fieldClass}`}
            >
              <option value={0}>เลือก Package</option>
              {packageGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {group.icon} {p.name} · {formatPackageSpecs(p)} — {formatTHB(p.price)} บาท
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!packageId && packages.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                ไม่มี Package ที่เปิดใช้งานอยู่ในช่วงวันที่ปัจจุบัน กรุณาตรวจสอบวันเริ่มใช้และวันหมดอายุใน Package Master
              </div>
            ) : packageId ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-primary/15 bg-primary/5">
                <button
                  type="button"
                  onClick={() => setShowPackageItems((current) => !current)}
                  aria-expanded={showPackageItems}
                  aria-controls="package-items-details"
                  className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-primary/5"
                >
                  <div>
                    <div className="text-xs font-bold text-primary">
                      รายการสำหรับใบเสนอราคานี้
                    </div>
                    <div className="mt-0.5 text-xxs text-gray-500">
                      {packageItemsLoading
                        ? "กำลังโหลดรายการ..."
                        : `${packageItems.length} รายการ`}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
                    {showPackageItems ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                    <span
                      aria-hidden="true"
                      className={`text-base transition-transform ${
                        showPackageItems ? "rotate-180" : ""
                      }`}
                    >
                      ⌄
                    </span>
                  </span>
                </button>
                {showPackageItems && (
                  <div
                    id="package-items-details"
                    className="border-t border-primary/10 bg-white/60 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xxs text-gray-500">
                        เพิ่ม ลบ หรือแก้ไขรายการได้เฉพาะใบเสนอราคานี้
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={restorePackageItems}
                          disabled={packageItemsLoading}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xxs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          คืนค่าจาก Master
                        </button>
                        <button
                          type="button"
                          onClick={addPackageItem}
                          className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xxs font-semibold text-primary hover:bg-primary/10"
                        >
                          + เพิ่มรายการ
                        </button>
                      </div>
                    </div>
                    <div className="hidden grid-cols-12 gap-2 px-1 pb-1 text-xxs font-semibold text-gray-500 md:grid">
                      <span className="col-span-7">ชื่อรายการ</span>
                      <span className="col-span-2">จำนวน</span>
                      <span className="col-span-2">หน่วย</span>
                    </div>
                    <div className="space-y-2">
                      {!packageItemsLoading && packageItems.length === 0 && (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-3 text-center text-xs text-gray-500">
                          ยังไม่มีรายการ กด “เพิ่มรายการ” หรือ “คืนค่าจาก Master”
                        </div>
                      )}
                      {packageItems.map((item, index) => (
                        <div
                          key={item.package_item_id || item.id || `package-item-${index}`}
                          className="grid grid-cols-12 items-center gap-2 rounded-lg border border-gray-100 bg-white p-2"
                        >
                          <input
                            value={item.item_name || ""}
                            onChange={(event) =>
                              updatePackageItem(index, {
                                item_name: event.target.value,
                              })
                            }
                            placeholder="ชื่ออุปกรณ์/บริการ"
                            aria-label={`ชื่อรายการ Package ลำดับ ${index + 1}`}
                            className={`col-span-7 ${compactFieldClass}`}
                          />
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={(event) =>
                              updatePackageItem(index, {
                                quantity: Number(event.target.value),
                              })
                            }
                            aria-label={`จำนวนรายการ Package ลำดับ ${index + 1}`}
                            className={`col-span-2 ${compactFieldClass}`}
                          />
                          <input
                            value={item.unit || ""}
                            onChange={(event) =>
                              updatePackageItem(index, {
                                unit: event.target.value,
                              })
                            }
                            placeholder="หน่วย"
                            aria-label={`หน่วยรายการ Package ลำดับ ${index + 1}`}
                            className={`col-span-2 ${compactFieldClass}`}
                          />
                          {index === 0 ? (
                            <span
                              aria-label="รายการหลัก ไม่สามารถลบได้"
                              title="รายการหลัก ไม่สามารถลบได้"
                              className="col-span-1 flex h-8 items-center justify-center text-xs text-gray-400"
                            >
                              🔒
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removePackageItem(index)}
                              aria-label={`ลบรายการ Package ลำดับ ${index + 1}`}
                              className="col-span-1 flex h-8 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
                  2
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">
                    รายการเพิ่มเติม
                  </h3>
                  <p className="text-xxs text-gray-500">
                    รายการพิเศษเฉพาะโครงการ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addAdditionalItemSelector}
                aria-label="เพิ่มช่องรายการเพิ่มเติม"
                title="เพิ่มช่องรายการเพิ่มเติม"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-white text-xl font-medium text-primary transition-colors hover:bg-primary/5"
              >
                +
              </button>
            </div>
            <div className="mt-3 hidden grid-cols-12 gap-2 px-2 text-xxs font-semibold text-gray-500 md:grid">
              <span className="col-span-6">ชื่อรายการ</span>
              <span className="col-span-2">จำนวน</span>
              <span className="col-span-3">ราคา/หน่วย (บาท)</span>
            </div>
            <div className="mt-2 space-y-2">
              {additionalItemSelectors.map((selector) => {
                const linkedItem = items.find(
                  (item) => item.editorSelectionId === selector.id,
                );
                const isPackageMasterSelection =
                  Boolean(selector.value) && selector.value !== "custom";
                return (
                  <div
                    key={selector.id}
                    className="overflow-hidden rounded-xl border border-primary/10 bg-primary/[0.025]"
                  >
                    <div className="grid grid-cols-12 items-center gap-2 p-2">
                    {selector.value === "custom" ? (
                      <input
                        value={linkedItem?.item_name || ""}
                        onChange={(e) =>
                          updateAdditionalSelectorItem(selector.id, {
                            item_name: e.target.value,
                          })
                        }
                        placeholder="ชื่ออุปกรณ์/บริการ"
                        aria-label={`ชื่อรายการเพิ่มเติมช่องที่ ${selector.id}`}
                        className={`col-span-6 ${compactFieldClass}`}
                      />
                    ) : (
                      <select
                        value={selector.value}
                        onChange={(e) =>
                          updateAdditionalItemSelection(
                            selector.id,
                            e.target.value,
                          )
                        }
                        aria-label={`เลือกรายการเพิ่มเติมช่องที่ ${selector.id}`}
                        className={`col-span-6 min-w-0 ${compactFieldClass}`}
                      >
                        <option value="">เลือกรายการเพิ่มเติม</option>
                        {packageGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items
                              .filter((candidate) => candidate.id !== packageId)
                              .map((candidate) => (
                                <option
                                  key={candidate.id}
                                  value={String(candidate.id)}
                                >
                                  {group.icon} {candidate.name} · {formatPackageSpecs(candidate)} — {formatTHB(candidate.price)} บาท
                                </option>
                              ))}
                          </optgroup>
                        ))}
                        <optgroup label="รายการอื่นๆ นอกเหนือจาก Package">
                          <option value="custom">
                            🧰 เพิ่มอุปกรณ์ / บริการอื่น
                          </option>
                        </optgroup>
                      </select>
                    )}
                    <input
                      type="number"
                      min="0"
                      value={linkedItem?.quantity ?? ""}
                      disabled={!linkedItem || isPackageMasterSelection}
                      title={
                        isPackageMasterSelection
                          ? "จำนวนกำหนดจาก Package Master"
                          : undefined
                      }
                      onChange={(e) =>
                        updateAdditionalSelectorItem(selector.id, {
                          quantity: Number(e.target.value),
                        })
                      }
                      aria-label={`จำนวนรายการเพิ่มเติมช่องที่ ${selector.id}`}
                      className={`col-span-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${compactFieldClass}`}
                    />
                    <input
                      type="number"
                      min="0"
                      value={linkedItem?.unit_price || ""}
                      disabled={!linkedItem || isPackageMasterSelection}
                      title={
                        isPackageMasterSelection
                          ? "ราคากำหนดจาก Package Master"
                          : undefined
                      }
                      onChange={(e) =>
                        updateAdditionalSelectorItem(selector.id, {
                          unit_price:
                            e.target.value === ""
                              ? 0
                              : Number(e.target.value),
                        })
                      }
                      placeholder="ราคา"
                      aria-label={`ราคาต่อหน่วยรายการเพิ่มเติมช่องที่ ${selector.id}`}
                      className={`col-span-3 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${compactFieldClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeAdditionalItemSelector(selector.id)}
                      aria-label="ลบรายการเพิ่มเติม"
                      className="col-span-1 flex h-8 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      ×
                    </button>
                    </div>
                    {selector.value && linkedItem && (
                        <div className="border-t border-primary/10 bg-white/70">
                          <button
                            type="button"
                            onClick={() =>
                              setShownAdditionalPackageItems((current) => ({
                                ...current,
                                [selector.id]: !current[selector.id],
                              }))
                            }
                            aria-expanded={Boolean(
                              shownAdditionalPackageItems[selector.id],
                            )}
                            aria-controls={`additional-package-items-${selector.id}`}
                            className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-primary/5"
                          >
                            <div>
                              <div className="text-xs font-bold text-primary">
                                รายการสำหรับใบเสนอราคานี้
                              </div>
                              <div className="mt-0.5 text-xxs text-gray-500">
                                {(additionalPackageItems[selector.id] || []).length} รายการ
                              </div>
                            </div>
                            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
                              {shownAdditionalPackageItems[selector.id]
                                ? "ซ่อนรายละเอียด"
                                : "ดูรายละเอียด"}
                              <span
                                aria-hidden="true"
                                className={`text-base transition-transform ${
                                  shownAdditionalPackageItems[selector.id]
                                    ? "rotate-180"
                                    : ""
                                }`}
                              >
                                ⌄
                              </span>
                            </span>
                          </button>
                          {shownAdditionalPackageItems[selector.id] && (
                          <div
                            id={`additional-package-items-${selector.id}`}
                            className="border-t border-primary/10 p-3"
                          >
                          <div className="mb-2 flex justify-end">
                            <div className="flex gap-2">
                              {isPackageMasterSelection && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    restoreAdditionalPackageItems(selector.id)
                                  }
                                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xxs font-semibold text-gray-600 hover:bg-gray-50"
                                >
                                  คืนค่าจาก Master
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  addAdditionalPackageItem(selector.id)
                                }
                                className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xxs font-semibold text-primary hover:bg-primary/10"
                              >
                                + เพิ่มรายการ
                              </button>
                            </div>
                          </div>
                          <div className="hidden grid-cols-12 gap-2 px-1 pb-1 text-xxs font-semibold text-gray-500 md:grid">
                            <span className="col-span-7">ชื่อรายการ</span>
                            <span className="col-span-2">จำนวน</span>
                            <span className="col-span-2">หน่วย</span>
                          </div>
                          <div className="space-y-2">
                            {(additionalPackageItems[selector.id] || []).map(
                              (detailItem, detailIndex) => (
                                <div
                                  key={
                                    detailItem.package_item_id ||
                                    detailItem.id ||
                                    `additional-${selector.id}-${detailIndex}`
                                  }
                                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-gray-100 bg-white p-2"
                                >
                                  <input
                                    value={detailItem.item_name || ""}
                                    onChange={(event) =>
                                      updateAdditionalPackageItem(
                                        selector.id,
                                        detailIndex,
                                        { item_name: event.target.value },
                                      )
                                    }
                                    aria-label={`ชื่อรายการย่อยเพิ่มเติม ${selector.id}-${detailIndex + 1}`}
                                    className={`col-span-7 ${compactFieldClass}`}
                                  />
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={detailItem.quantity}
                                    onChange={(event) =>
                                      updateAdditionalPackageItem(
                                        selector.id,
                                        detailIndex,
                                        { quantity: Number(event.target.value) },
                                      )
                                    }
                                    aria-label={`จำนวนรายการย่อยเพิ่มเติม ${selector.id}-${detailIndex + 1}`}
                                    className={`col-span-2 ${compactFieldClass}`}
                                  />
                                  <input
                                    value={detailItem.unit || ""}
                                    onChange={(event) =>
                                      updateAdditionalPackageItem(
                                        selector.id,
                                        detailIndex,
                                        { unit: event.target.value },
                                      )
                                    }
                                    placeholder="หน่วย"
                                    aria-label={`หน่วยรายการย่อยเพิ่มเติม ${selector.id}-${detailIndex + 1}`}
                                    className={`col-span-2 ${compactFieldClass}`}
                                  />
                                  {isPackageMasterSelection &&
                                  detailIndex === 0 ? (
                                    <span
                                      aria-label="หัวรายการเพิ่มเติม ไม่สามารถลบได้"
                                      title="หัวรายการเพิ่มเติม ไม่สามารถลบได้"
                                      className="col-span-1 flex h-8 items-center justify-center text-xs text-gray-400"
                                    >
                                      🔒
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeAdditionalPackageItem(
                                          selector.id,
                                          detailIndex,
                                        )
                                      }
                                      aria-label={`ลบรายการย่อยเพิ่มเติม ${selector.id}-${detailIndex + 1}`}
                                      className="col-span-1 flex h-8 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ),
                            )}
                          </div>
                          </div>
                          )}
                        </div>
                      )}
                  </div>
                );
              })}
              {items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.editorSelectionId === undefined)
                .map(({ item: i, index: n }) => (
                <div
                  key={i.id || `existing-${n}`}
                  className="grid grid-cols-12 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-2"
                >
                  <input
                    value={i.item_name || ""}
                    onChange={(e) =>
                      updateItem(n, { item_name: e.target.value })
                    }
                    placeholder="ชื่ออุปกรณ์/บริการ"
                    className={`col-span-6 ${compactFieldClass}`}
                  />
                  <input
                    type="number"
                    value={i.quantity}
                    onChange={(e) =>
                      updateItem(n, { quantity: Number(e.target.value) })
                    }
                    className={`col-span-2 ${compactFieldClass}`}
                  />
                  <input
                    type="number"
                    min="0"
                    value={i.unit_price || ""}
                    onChange={(e) =>
                      updateItem(n, {
                        unit_price:
                          e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    placeholder="เช่น 1,000"
                    className={`col-span-3 ${compactFieldClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeAdditionalItem(n)}
                    aria-label="ลบรายการ"
                    className="col-span-1 flex h-8 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                3
              </span>
              <div>
                <h3 className="text-sm font-bold text-gray-800">
                  ส่วนลดและเงินจอง
                </h3>
                <p className="text-xxs text-gray-500">
                  ระบุส่วนลดและยอดที่ชำระแล้ว
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="md:col-span-2">
                <span className="text-xs font-semibold text-gray-500">Discount Text</span>
                <input
                  value={discountLabel}
                  maxLength={200}
                  onChange={(e) => setDiscountLabel(e.target.value)}
                  placeholder="เช่น โปรโมชั่น, ส่วนลดพนักงาน"
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-gray-500">%</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent || ""}
                  onChange={(e) => {
                    setDiscountType("percent");
                    setDiscountValue(Math.min(100, Math.max(0, Number(e.target.value) || 0)));
                  }}
                  placeholder="0"
                  className={`mt-1 text-right ${fieldClass}`}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-gray-500">บาท</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discountAmount || ""}
                  onChange={(e) => {
                    setDiscountType("amount");
                    setDiscountValue(Math.min(subtotal, Math.max(0, Number(e.target.value) || 0)));
                  }}
                  placeholder="0"
                  className={`mt-1 text-right ${fieldClass}`}
                />
              </label>
            </div>
            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-500">
                ค่าสำรวจ/เงินจองที่ชำระแล้ว
              </label>
              {isFreeSurvey ? (
                <div className="mt-1 flex min-h-[58px] items-center justify-between gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-sm font-bold text-white">
                      ✓
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-cyan-800">
                        ฟรีค่าสำรวจ
                      </div>
                    </div>
                  </div>
                  <b className="shrink-0 text-base text-cyan-700">0 บาท</b>
                </div>
              ) : confirmedDeposit > 0 ? (
                <div className="mt-1 flex min-h-[58px] items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                      ✓
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-emerald-800">
                        ยืนยันการชำระแล้ว
                      </div>
                      <div className="text-xxs text-emerald-600">
                        ยอดจากรายการรับชำระ แก้ไขได้จากหน้าการชำระเงิน
                      </div>
                    </div>
                  </div>
                  <b className="shrink-0 text-base text-emerald-700">
                    {formatTHB(confirmedDeposit)} บาท
                  </b>
                </div>
              ) : (
                <>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={deposit || ""}
                    onChange={(e) =>
                      setDeposit(Math.max(0, Number(e.target.value) || 0))
                    }
                    placeholder="0"
                    className={`mt-1 ${fieldClass}`}
                  />
                  <p className="mt-1 text-xxs text-gray-400">
                    กรอกเมื่อได้รับค่าสำรวจหรือเงินจองแล้ว
                  </p>
                </>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  4
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">งวดชำระเงิน</h3>
                  <p className="text-xxs text-gray-500">
                    เพิ่มและกำหนดรายละเอียดแต่ละงวดได้
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addPaymentTerm}
                aria-label="เพิ่มงวดชำระเงิน"
                title="เพิ่มงวดชำระเงิน"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-xl font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                +
              </button>
            </div>
            <div className="mb-3 rounded-xl border border-primary/15 bg-white/80 p-3">
              <div className="mb-2 text-xs font-bold text-gray-700">
                สรุปราคา
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <div>
                  <small className="text-gray-400">Package</small>
                  <b className="mt-1 block text-gray-800">
                    {formatTHB(pkg?.price || 0)}
                  </b>
                </div>
                <div>
                  <small className="text-gray-400">ยอดรวม</small>
                  <b className="mt-1 block text-gray-800">
                    {formatTHB(subtotal)}
                  </b>
                </div>
                <div>
                  <small className="text-gray-400">ส่วนลด</small>
                  <b className="mt-1 block text-red-500">
                    -{formatTHB(discountAmount)}
                  </b>
                </div>
                <div>
                  <small className="text-gray-400">หักยอดชำระแล้ว</small>
                  <b className="mt-1 block text-red-500">
                    -{formatTHB(deposit)}
                  </b>
                </div>
                <div>
                  <small className="text-gray-400">ยอดที่ต้องชำระ</small>
                  <b className="mt-1 block text-lg text-primary">
                    {formatTHB(outstanding)}
                  </b>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {terms.map((term, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-emerald-100 bg-white p-2 text-sm"
                >
                  <input
                    value={term.label}
                    maxLength={200}
                    onChange={(e) =>
                      updatePaymentTerm(index, { label: e.target.value })
                    }
                    aria-label={`ชื่องวดที่ ${index + 1}`}
                    className={`col-span-3 ${compactFieldClass}`}
                  />
                  <div className="relative col-span-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      disabled={index === terms.length - 1}
                      value={
                        Number.isNaN(term.percent)
                          ? ""
                          : Math.round(term.percent * 100) / 100
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        updatePaymentTerm(index, {
                          percent:
                            value === ""
                              ? Number.NaN
                              : Math.min(100, Math.max(0, Number(value))),
                        });
                      }}
                      placeholder="0"
                      aria-label={`เปอร์เซ็นต์งวดที่ ${index + 1}`}
                      title={
                        index === terms.length - 1
                          ? "งวดสุดท้ายปรับให้ครบ 100% อัตโนมัติ"
                          : "กรอกเปอร์เซ็นต์เพื่อคำนวณยอดเงินอัตโนมัติ"
                      }
                      className={`pr-7 text-right font-bold text-emerald-700 ${compactFieldClass}`}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-700">
                      %
                    </span>
                  </div>
                  <div className="relative col-span-2">
                    <input
                      type="number"
                      min="0"
                      max={outstanding}
                      step="0.01"
                      value={
                        Number.isNaN(getPaymentTermAmount(term.percent, index))
                          ? ""
                          : getPaymentTermAmount(term.percent, index)
                      }
                      disabled={
                        outstanding <= 0 || index === terms.length - 1
                      }
                      onChange={(e) =>
                        updatePaymentTermAmount(index, e.target.value)
                      }
                      placeholder="0"
                      aria-label={`ยอดชำระงวดที่ ${index + 1}`}
                      title={
                        index === terms.length - 1
                          ? "งวดสุดท้ายปรับให้ครบยอดที่ต้องชำระอัตโนมัติ"
                          : "กรอกยอดเงินเพื่อคำนวณเปอร์เซ็นต์อัตโนมัติ"
                      }
                      className={`pr-9 text-right font-bold text-emerald-700 ${compactFieldClass}`}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xxs text-emerald-700">
                      บาท
                    </span>
                  </div>
                  <input
                    value={term.due}
                    maxLength={500}
                    onChange={(e) =>
                      updatePaymentTerm(index, { due: e.target.value })
                    }
                    placeholder="ระบุเงื่อนไขการชำระ"
                    aria-label={`เงื่อนไขงวดที่ ${index + 1}`}
                    className={`col-span-4 ${compactFieldClass}`}
                  />
                  <button
                    type="button"
                    disabled={terms.length === 1}
                    onClick={() => removePaymentTerm(index)}
                    aria-label={`ลบงวดที่ ${index + 1}`}
                    className="col-span-1 flex h-8 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
                ))}
            </div>
            <p
              className={`mt-2 text-xxs ${
                termsPercentTotal === 100 ? "text-emerald-700" : "text-red-600"
              }`}
            >
              รวม {termsPercentTotal}% • งวดสุดท้ายปรับอัตโนมัติให้ครบยอดที่ต้องชำระ
            </p>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-600 text-xs font-bold text-white">
                5
              </span>
              <h3 className="text-sm font-bold text-gray-800">
                เงื่อนไขเพิ่มเติม
              </h3>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500">
                  วันที่ใบเสนอราคา
                </span>
                <input
                  type="date"
                  value={issueDate}
                  max={todayIso()}
                  onChange={(e) => setIssueDate(e.target.value || todayIso())}
                  className={`mt-1 md:max-w-[220px] ${fieldClass}`}
                />
                <p className="mt-1 text-xxs text-gray-400">
                  วันที่แสดงบนเอกสารใบเสนอราคา (ค่าเริ่มต้น = วันนี้ · เลือกล่วงหน้าไม่ได้)
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-500">
                  เงื่อนไขเพิ่มเติม
                </span>
                <textarea
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  placeholder="เงื่อนไขเพิ่มเติม"
                  rows={3}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 bg-gray-50/90 p-4 backdrop-blur-sm">
          <button
            type="button"
            disabled={saving}
            onClick={previewQuotation}
            title="แสดงข้อมูลที่กำลังกรอกโดยไม่บันทึก"
            className="rounded-lg border border-primary/30 bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ดูตัวอย่างใบเสนอราคา
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-gradient-to-r from-primary to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกฉบับร่าง"}
          </button>
        </div>
      </div>
    </div>
  );
}
