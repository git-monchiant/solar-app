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
  getQuotationTermsProfile,
  isStandardQuotationTermTree,
  parseQuotationOmSettings,
  parseQuotationPaymentTerms,
  parseQuotationTermTree,
  type QuotationOmSettings,
  type QuotationPaymentTerm,
  type QuotationTermTree,
} from "@/lib/quotation-terms";
import QuotationTermsEditor from "./QuotationTermsEditor";
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
  om: QuotationOmSettings;
  // ชุดเงื่อนไข/ข้อกำหนดที่แก้เฉพาะใบนี้ · null = ยังใช้ชุดมาตรฐานในโค้ด
  terms: QuotationTermTree | null;
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
  valid_days?: number;
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
  submitted_by_name?: string;
  submitted_at?: string;
  solar_approved_by_name?: string;
  solar_approved_at?: string;
  approved_by_name?: string;
  approved_at?: string;
  document_inputs_json?: string;
  document_snapshot_at?: string;
  approval_certified_at?: string;
  last_reminded_at?: string | null;
  last_reminded_by_name?: string | null;
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
  pending_solar_sup: "รอ Solar Manager อนุมัติ",
  pending_sales_sup: "รอ Sale Manager อนุมัติ",
  pending_approval: "รอ Sale Manager อนุมัติ",
  approved: "อนุมัติแล้ว",
  changes_required: "ส่งกลับแก้ไข",
  cancelled: "ยกเลิกแล้ว",
};

function formatApprovalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const shortDate = date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${shortDate} ${formatThaiTime(value)}`;
}

type ApprovalFlowStepState =
  | "completed"
  | "active"
  | "returned"
  | "upcoming"
  | "cancelled";

function ApprovalFlowStatus({
  status,
  returnedByRole,
  submittedByName,
  submittedAt,
  solarApprovedByName,
  solarApprovedAt,
  approvedByName,
  approvedAt,
}: {
  status: string;
  returnedByRole?: string;
  submittedByName?: string;
  submittedAt?: string;
  solarApprovedByName?: string;
  solarApprovedAt?: string;
  approvedByName?: string;
  approvedAt?: string;
}) {
  const currentStep =
    status === "approved"
      ? 3
      : ["pending_sales_sup", "pending_approval"].includes(status)
        ? 2
        : status === "pending_solar_sup"
          ? 1
          : 0;
  const isReturned = status === "changes_required";
  const isCancelled = status === "cancelled";
  const approvalDetails = [
    { name: submittedByName, approvedAt: submittedAt },
    { name: solarApprovedByName, approvedAt: solarApprovedAt },
    { name: approvedByName, approvedAt },
  ];
  const steps = ["Sale", "Solar Manager", "Sale Manager"].map((label, index) => {
    let state: ApprovalFlowStepState = "upcoming";
    if (isCancelled) state = "cancelled";
    else if (isReturned && index === 0) state = "returned";
    else if (index < currentStep) state = "completed";
    else if (index === currentStep && currentStep < 3) state = "active";

    const detail =
      state === "completed"
        ? index === 0
          ? "ส่งแล้ว"
          : "อนุมัติแล้ว"
        : state === "returned"
          ? "รอแก้ไข"
          : state === "active"
            ? index === 0
              ? "รอส่ง"
              : "ยังไม่อนุมัติ"
            : state === "cancelled"
              ? "ยกเลิก"
              : "ยังไม่อนุมัติ";
    return { label, state, detail, approval: approvalDetails[index] };
  });
  const title = `${statusLabel[status] || status}${isReturned && returnedByRole ? `โดย ${returnedByRole}` : ""}`;

  return (
    <ol
      className="flex min-w-0 flex-1 items-start"
      aria-label={`Approval flow: ${title}`}
      title={title}
    >
      {steps.map((step, index) => {
        const isCurrent = step.state === "active" || step.state === "returned";
        const isCompleted = step.state === "completed";
        const nodeClass = isCompleted
          ? "bg-emerald-500"
          : step.state === "active"
            ? "bg-amber-500 ring-2 ring-amber-200 shadow-sm"
            : step.state === "returned"
              ? "bg-red-500 ring-2 ring-red-200 shadow-sm"
              : "bg-gray-200";
        const textClass =
          isCompleted
            ? "text-emerald-700"
            : step.state === "active"
              ? "text-amber-700"
              : step.state === "returned"
                ? "text-red-600"
                : "text-gray-400";
        const connectorComplete = index < currentStep && !isCancelled && !isReturned;

        return (
          <li key={step.label} className="relative flex min-w-0 flex-1 items-start">
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-[13px] h-0.5 ${connectorComplete ? "bg-emerald-400" : "bg-gray-200"}`}
              />
            )}
            <div className="flex w-full min-w-0 flex-col items-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${nodeClass}`}
              >
                {isCompleted && (
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className={`mt-1.5 max-w-full text-center text-xs font-semibold leading-tight ${textClass}`}>
                {step.label}
              </span>
              {isCompleted && step.approval?.name ? (
                <>
                  {/* ใช้ "โดย :" สั้นๆ แทน "จัดทำโดย/อนุมัติโดย" ที่ยาวจนโดนตัด
                      ข้อความเต็มยังอยู่ใน tooltip */}
                  <span
                    className={`mt-1 line-clamp-2 max-w-full text-center text-xxs leading-tight ${textClass}`}
                    title={`${index === 0 ? "จัดทำโดย" : "อนุมัติโดย"} ${step.approval.name}`}
                  >
                    โดย : {step.approval.name}
                  </span>
                  {step.approval.approvedAt && (
                    <span
                      className={`mt-0.5 max-w-full truncate whitespace-nowrap text-xxs leading-tight ${textClass}`}
                      title={`${formatThaiDateShort(step.approval.approvedAt)} ${formatThaiTime(step.approval.approvedAt)} น.`}
                    >
                      {formatApprovalDateTime(step.approval.approvedAt)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span
                    className={`mt-1 line-clamp-2 max-w-full text-center text-xxs leading-tight ${textClass}`}
                    title={step.state === "returned" && returnedByRole ? `ส่งกลับโดย ${returnedByRole}` : undefined}
                  >
                    {step.detail}
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
// Local-time YYYY-MM-DD for the quotation date input default (never UTC —
// toISOString would roll to the next day for evening edits in +07:00).
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatPackageSpecs = (pkg: Package) =>
  `ขนาด ${pkg.kwp} kWp · ${pkg.phase > 0 ? `${pkg.phase} เฟส` : "ทุกเฟส"}`;
// ชื่อรายการใน Package Master บางบรรทัดมี "–" นำหน้า (ไว้จัดรูปแบบใน PDF)
// ตัดออกตอนแสดงในตัวแก้ไข ทุกบรรทัดจะเริ่มตรงกัน — ตัวสร้าง PDF ใส่ "-" ให้เอง
const stripLeadMark = (name: string) => name.replace(/^\s*[-–—•]\s*/, "");

/** ป๊อปอัปเลือกแพ็กเกจ — กดปุ่มแล้วเด้งขึ้นมาเลือก (มีช่องค้นหาในตัว) */
type PricePeriod = {
  id: number;
  package_id: number;
  price: number;
  start_date: string | null;
  expire_date: string | null;
  is_active: boolean;
};

const periodRangeText = (p: PricePeriod) => {
  const day = (v: string | null) => {
    const d = (v || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "-";
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  };
  return `${day(p.start_date)} – ${day(p.expire_date)}`;
};

function PackagePickerDialog({
  groups,
  onPick,
  onClose,
}: {
  groups: Array<{ label: string; icon: string; items: Package[] }>;
  onPick: (packageId: number) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const matches = (p: Package) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return `${p.name} ${formatPackageSpecs(p)} ${p.price} ${p.inverter_brand || ""}`
      .toLowerCase()
      .includes(q);
  };
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter(matches) }))
    .filter((g) => g.items.length);
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/40 p-4 pt-[8vh] backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 p-3">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="พิมพ์ค้นหาแพ็กเกจ เช่น 5 kWp, Battery, Scale Up…"
            className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((group) => (
            <div key={group.label} className="border-t border-gray-100 first:border-t-0">
              <div className="sticky top-0 z-10 bg-gray-50/95 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-gray-500 backdrop-blur">
                {group.icon} {group.label}
              </div>
              {group.items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="shrink-0 text-base">
                      {group.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-800">
                        {p.name}
                      </span>
                      <span className="text-xxs text-gray-400">{formatPackageSpecs(p)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-gray-700">
                    {formatTHB(p.price)}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {!visible.length && (
            <div className="px-3 py-10 text-center text-xs text-gray-400">
              ไม่พบแพ็กเกจที่ตรงกับ “{filter}”
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


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
            ? "ยืนยันว่า Solar Manager ตรวจเอกสารแล้ว และส่งต่อให้ Sale Manager อนุมัติขั้นสุดท้าย"
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
                  <div className="h-10 w-60 rounded-lg bg-gray-100" />
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
                <div className="w-[100px] shrink-0 overflow-hidden">
                  <div className="flex items-center gap-3">
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
                    <div className="whitespace-nowrap font-bold text-sm text-gray-900">
                      ชุด {option}
                    </div>
                  </div>
                  <div
                    className="mt-1 truncate whitespace-nowrap text-center font-mono text-xxs text-gray-400"
                    title={`${q.doc_no}${q.revision_no > 0 ? ` · Rev.${q.revision_no}` : ""}`}
                  >
                    {q.doc_no}
                    {q.revision_no > 0 ? ` · Rev.${q.revision_no}` : ""}
                  </div>
                </div>
                <ApprovalFlowStatus
                  status={q.status}
                  returnedByRole={q.returned_by_role}
                  submittedByName={q.submitted_by_name}
                  submittedAt={q.submitted_at}
                  solarApprovedByName={q.solar_approved_by_name}
                  solarApprovedAt={q.solar_approved_at}
                  approvedByName={q.approved_by_name}
                  approvedAt={q.approved_at}
                />
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
              {isPendingQuotation(q.status) && q.last_reminded_at && (
                <div className="mt-2 text-xxs text-amber-700">
                  แจ้งเตือนล่าสุดโดย {q.last_reminded_by_name || "ผู้ใช้งาน"} · {formatThaiDateShort(q.last_reminded_at)} {formatThaiTime(q.last_reminded_at)} น.
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
              {(() => {
                // ใบที่ออกด้วยราคาคนละเดือนกับราคาที่ใช้อยู่ตอนนี้ ต้องเห็นชัดก่อนส่งอนุมัติ
                const currentPrice = pkg ? Number(pkg.price) : null;
                const snapshot = q.package_price_snapshot == null ? null : Number(q.package_price_snapshot);
                if (currentPrice == null || snapshot == null || snapshot === currentPrice) return null;
                return (
                  <div className="mt-1 text-right text-xxs font-semibold text-red-600">
                    * ใบเสนอราคานี้ไม่ตรงกับราคาเดือนปัจจุบัน
                  </div>
                );
              })()}
              <div className="mt-3 grid h-14 grid-cols-3 gap-2">
                {["draft", "changes_required"].includes(q.status) ? (
                  <div className="col-span-3 flex h-full gap-2">
                    <button
                      onClick={() => setEditing(option)}
                      className="h-full px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs font-semibold whitespace-nowrap"
                    >
                      ✎ แก้ไข
                    </button>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="h-full flex-1 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                    {q.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => remove(q.id)}
                        aria-label="ลบฉบับร่าง"
                        title="ลบฉบับร่าง"
                        className="h-full px-3 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
                      className="h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setReturnNote("");
                        setReturnModal({ id: q.id });
                      }}
                      className="h-full rounded-lg bg-red-50 px-2 text-red-700 text-xs font-semibold leading-4"
                    >
                      ส่งกลับ
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => act(q.id, "approve", "", q.status)}
                      className="h-full rounded-lg bg-emerald-600 px-2 text-white text-xs font-semibold leading-4"
                    >
                      {q.status === "pending_solar_sup"
                        ? "อนุมัติส่งต่อ"
                        : "อนุมัติ"}
                    </button>
                  </>
                ) : isPendingQuotation(q.status) ? (
                  <button
                    onClick={() => openPdf(q.id)}
                    className="col-span-3 h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4"
                  >
                    ดูใบเสนอราคา
                  </button>
                ) : q.status === "approved" ? (
                  <>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="col-span-2 h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4"
                    >
                      ▣ ดูใบเสนอราคา
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => act(q.id, "revise")}
                      className="h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4"
                    >
                      Revision
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => openPdf(q.id)}
                      className="col-span-3 h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4"
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

/* ── Tree model ────────────────────────────────────────────────────────────
   ใบเสนอราคา = ต้นไม้ของ "หัวข้อ" (บรรทัดที่ขึ้นเอกสาร + ราคา) และ
   "รายละเอียด" ใต้หัวข้อนั้น (ชื่อ/จำนวน/หน่วย ไม่มีราคา)
     • หัวข้อชนิด package  → เลือกจาก Package Master, ราคามาจาก master
     • หัวข้อชนิด custom   → "งานเพิ่ม" พิมพ์ชื่อและราคาเอง
   แพ็กเกจที่อยู่บนสุด = แพ็กเกจหลักของใบ (ชื่อขึ้นหัวเอกสาร)              */
type TreeLine = {
  key: string;
  package_item_id?: number | null;
  item_name: string;
  quantity: number;
  /** จำนวนต่อ 1 ชุดของหัวข้อ — ฐานสำหรับคูณเวลาแก้จำนวนชุด */
  unitQuantity?: number;
  unit: string;
};
type TreeGroup = {
  key: string;
  kind: "package" | "custom";
  source_package_id?: number;
  price: number;
  /** ราคา/จำนวนอุปกรณ์ ต่อ 1 ชุด — ใช้เป็นฐานคำนวณเวลาแก้จำนวน
   *  (ถ้าคูณทบจากค่าปัจจุบัน พอผู้ใช้ลบเลขทิ้งแล้วพิมพ์ใหม่ ตัวคูณเดิมจะหาย
   *   แล้วค่าจะบานปลาย เช่น 10 → ลบ → 5 กลายเป็น ×50) */
  unitPrice?: number;
  title: TreeLine;   // = item แรกของ package (บรรทัดที่โชว์บนเอกสาร)
  details: TreeLine[];
  open: boolean;
};
let treeSeq = 0;
const treeKey = () => `t${Date.now().toString(36)}${++treeSeq}`;
const asLine = (raw: Record<string, unknown>): TreeLine => ({
  key: treeKey(),
  package_item_id: (raw.package_item_id as number) ?? null,
  item_name: stripLeadMark(String(raw.item_name_snapshot || raw.item_name || "")),
  quantity: Number(raw.quantity) || 1,
  unit: String(raw.unit || ""),
});

/** แปลงรายการที่บันทึกไว้กลับเป็น tree ตอนเปิดใบเก่ามาแก้ */
function hydrateGroups(quote: Quote | undefined): TreeGroup[] {
  const rows = (quote?.items || []) as unknown as Array<Record<string, unknown>>;
  const groups: TreeGroup[] = [];
  const mainRows = rows.filter((r) => r.source_type === "package");
  if (mainRows.length) {
    const [first, ...rest] = mainRows;
    groups.push({
      key: treeKey(),
      kind: "package",
      source_package_id: Number(quote?.package_id) || undefined,
      price: Number(quote?.package_price_snapshot) || 0,
      title: asLine(first),
      details: rest.map(asLine),
      open: true,
    });
  }
  for (const row of rows) {
    const type = String(row.source_type || "");
    if (type === "package") continue;
    if (type === "addon_package" || type === "custom_group") {
      groups.push({
        key: treeKey(),
        kind: type === "addon_package" ? "package" : "custom",
        source_package_id: Number(row.source_package_id) || undefined,
        price:
          Number(row.line_total) ||
          (Number(row.quantity) || 1) * (Number(row.unit_price) || 0),
        title: asLine(row),
        details: [],
        open: true,
      });
      continue;
    }
    if (type === "addon_package_detail" || type === "custom_detail") {
      groups[groups.length - 1]?.details.push(asLine(row));
      continue;
    }
    // legacy: รายการเดี่ยวที่ไม่มีลูก
    groups.push({
      key: treeKey(),
      kind: "custom",
      price: (Number(row.quantity) || 1) * (Number(row.unit_price) || 0),
      title: asLine(row),
      details: [],
      open: false,
    });
  }
  return groups;
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

  // ── ต้นไม้รายการ ────────────────────────────────────────────────────
  const [groups, setGroups] = useState<TreeGroup[]>(() => hydrateGroups(quote));
  const [loadingPackage, setLoadingPackage] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patchGroup = (key: string, patch: Partial<TreeGroup>) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  /** accordion — กางได้ทีละหัวข้อ ที่เหลือหุบอัตโนมัติ */
  const toggleGroup = (key: string) =>
    setGroups((gs) =>
      gs.map((g) => ({ ...g, open: g.key === key ? !g.open : false })),
    );
  const patchLine = (
    groupKey: string,
    lineKey: string,
    patch: Partial<TreeLine>,
  ) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key !== groupKey
          ? g
          : lineKey === g.title.key
            ? { ...g, title: { ...g.title, ...patch } }
            : {
                ...g,
                details: g.details.map((d) =>
                  d.key === lineKey ? { ...d, ...patch } : d,
                ),
              },
      ),
    );
  const addDetail = (groupKey: string) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key !== groupKey
          ? { ...g, open: false }
          : g.key === groupKey
          ? {
              ...g,
              open: true,
              details: [
                ...g.details,
                { key: treeKey(), item_name: "", quantity: 1, unit: "ชุด" },
              ],
            }
          : g,
      ),
    );
  const removeDetail = (groupKey: string, lineKey: string) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key === groupKey
          ? { ...g, details: g.details.filter((d) => d.key !== lineKey) }
          : g,
      ),
    );
  const removeGroup = (key: string) =>
    setGroups((gs) => gs.filter((g) => g.key !== key));
  const moveGroup = (key: string, dir: -1 | 1) =>
    setGroups((gs) => {
      const i = gs.findIndex((g) => g.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= gs.length) return gs;
      const next = [...gs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  /** ดึงชุดรายการของแพ็กเกจจาก Master มาสร้างเป็นหัวข้อใหม่ (item แรก = ชื่อบนเอกสาร) */
  const loadPackageGroup = async (packageId: number, replaceKey?: string) => {
    const chosen = packages.find((p) => p.id === packageId);
    if (!chosen) return;
    setLoadingPackage(true);
    try {
      const rows: Array<Record<string, unknown>> = await apiFetch(
        `/api/packages/${packageId}/items`,
      ).catch(() => []);
      const lines = (rows || []).map(asLine);
      const group: TreeGroup = {
        key: replaceKey || treeKey(),
        kind: "package",
        source_package_id: packageId,
        price: Number(chosen.price) || 0,
        title: lines[0] || {
          key: treeKey(),
          item_name: chosen.name,
          quantity: 1,
          unit: "ชุด",
        },
        details: lines.slice(1),
        open: true,
      };
      setGroups((gs) => {
        if (replaceKey) return gs.map((g) => (g.key === replaceKey ? group : g));
        // แพ็กเกจใหม่แทรกต่อท้ายกลุ่มแพ็กเกจ — "งานเพิ่ม" อยู่ล่างสุดเสมอ
        // และหุบหัวข้ออื่นไว้ (กางได้ทีละอัน)
        const closed = gs.map((g) => ({ ...g, open: false }));
        const firstCustom = closed.findIndex((g) => g.kind === "custom");
        return firstCustom < 0
          ? [...closed, group]
          : [...closed.slice(0, firstCustom), group, ...closed.slice(firstCustom)];
      });
    } finally {
      setLoadingPackage(false);
    }
  };
  const addCustomGroup = () =>
    setGroups((gs) => [
      ...gs.map((g) => ({ ...g, open: false })),
      {
        key: treeKey(),
        kind: "custom",
        price: 0,
        title: { key: treeKey(), item_name: "", quantity: 1, unit: "งาน" },
        details: [],
        open: true,
      },
    ]);
  // จัดกลุ่มแพ็กเกจให้ตัวเลือกค้นหา (ชุดเดียวกับหน้า Package Master)
  const packageGroups = [
    {
      label: "แพ็กเกจมาตรฐาน (Solar Rooftop)",
      icon: "☀️",
      items: packages.filter((p) => !p.has_battery && !p.is_upgrade && !p.is_other),
    },
    {
      label: "แพ็กเกจเพิ่มขนาดระบบ (Scale Up)",
      icon: "📈",
      items: packages.filter((p) => p.is_upgrade && !p.is_other),
    },
    {
      label: "แพ็กเกจแบตเตอรี่ / Hybrid",
      icon: "🔋",
      items: packages.filter((p) => p.has_battery && !p.is_upgrade && !p.is_other),
    },
    { label: "Package อื่นๆ", icon: "📦", items: packages.filter((p) => p.is_other) },
  ].filter((group) => group.items.length > 0);
  // แพ็กเกจบนสุด = แพ็กเกจหลักของใบนี้
  const mainIndex = groups.findIndex((g) => g.kind === "package");
  const mainGroup = mainIndex >= 0 ? groups[mainIndex] : undefined;
  const mainPackage = packages.find((p) => p.id === mainGroup?.source_package_id);
  // ช่วงราคาของทุกแพ็กเกจ ดึงครั้งเดียว ใช้ให้ทุกกลุ่มในทรีกดเปลี่ยนราคาได้
  const [pricePeriods, setPricePeriods] = useState<Record<number, PricePeriod[]>>({});
  // key ของกลุ่มที่เปิด dropdown ราคาอยู่ + ทิศทางที่กาง (ขึ้น/ลง) ตามที่ว่างบนจอ
  const [openPriceKey, setOpenPriceKey] = useState<string | null>(null);
  const [priceDropUp, setPriceDropUp] = useState(false);
  useEffect(() => {
    if (!openPriceKey) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPriceKey(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPriceKey]);
  useEffect(() => {
    apiFetch(`/api/packages/price-periods?lead_id=${lead.id}`)
      .then((rows: PricePeriod[]) => {
        const byPackage: Record<number, PricePeriod[]> = {};
        for (const row of Array.isArray(rows) ? rows : []) {
          (byPackage[row.package_id] ||= []).push(row);
        }
        setPricePeriods(byPackage);
      })
      .catch(() => setPricePeriods({}));
  }, [lead.id]);

  // ── การเงิน ─────────────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    quote?.discount_type === "percent" ? "percent" : "amount",
  );
  const [discountValue, setDiscountValue] = useState(
    Math.max(0, Number(quote?.discount_value) || 0),
  );
  const [discountLabel, setDiscountLabel] = useState(quote?.discount_label || "");
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
  // อ่านอย่างเดียว — แท็บ "เงื่อนไข/ข้อกำหนด" มาแทนช่องพิมพ์เดิมแล้ว แต่ยังส่งค่าเดิม
  // กลับไปตามเดิมเพื่อไม่ให้ข้อมูลของใบเก่าหาย และใช้เป็นบรรทัดตั้งต้นในแท็บนั้น
  const [termsText] = useState(quote?.terms_text || "");
  const [issueDate, setIssueDate] = useState(
    quote?.issue_date ? String(quote.issue_date).slice(0, 10) : todayIso(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [documentInputs, setDocumentInputs] = useState<DocumentInputs>(() => {
    let saved: Partial<DocumentInputs> = {};
    try {
      saved = JSON.parse(quote?.document_inputs_json || "{}");
    } catch {}
    return {
      om: parseQuotationOmSettings(saved.om),
      terms: parseQuotationTermTree(
        saved.terms,
        saved.terms?.profile === "additional_install" ? "additional_install" : "full_install",
      ),
      recommendation_reason: saved.recommendation_reason || "",
      loan_enabled: saved.loan_enabled ?? GSB_SOLAR_LOAN_DEFAULTS.loan_enabled,
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
        saved.down_payment_percent ?? GSB_SOLAR_LOAN_DEFAULTS.down_payment_percent,
      ),
      interest_rate_year_1_2: Number(
        saved.interest_rate_year_1_2 ?? GSB_SOLAR_LOAN_DEFAULTS.interest_rate_year_1_2,
      ),
      interest_rate_year_3_plus: Number(
        saved.interest_rate_year_3_plus ??
          GSB_SOLAR_LOAN_DEFAULTS.interest_rate_year_3_plus,
      ),
      rate_source: saved.rate_source || GSB_SOLAR_LOAN_DEFAULTS.rate_source,
      rate_effective_date:
        saved.rate_effective_date || GSB_SOLAR_LOAN_DEFAULTS.rate_effective_date,
      current_monthly_bill: Number(
        saved.current_monthly_bill ||
          lead.survey_monthly_bill ||
          lead.pre_monthly_bill ||
          lead.monthly_bill_max ||
          0,
      ),
      electricity_rate: Number(saved.electricity_rate || 5),
      production_kwh_per_kw_month: Number(saved.production_kwh_per_kw_month || 120),
      annual_degradation_percent: Number(saved.annual_degradation_percent ?? 0.5),
    };
  });
  // ตั้งชื่อ activeTab ไม่ใช่ tab — previewQuotation มีตัวแปร tab (หน้าต่างที่เปิดใหม่) อยู่แล้ว
  const [activeTab, setActiveTab] = useState<"items" | "terms">("items");
  useEffect(() => {
    if (quote || templateId || !defaultTemplate) return;
    setTemplateId(defaultTemplate.id);
  }, [defaultTemplate, quote, templateId]);
  useEffect(() => {
    if (isFreeSurvey) setDeposit(0);
    else if (confirmedDeposit > 0) setDeposit(confirmedDeposit);
  }, [confirmedDeposit, isFreeSurvey]);

  const subtotal = groups.reduce((sum, g) => sum + (Number(g.price) || 0), 0);
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

  const termsPercentTotal = getQuotationPaymentTermsTotal(terms);
  const updatePaymentTerm = (idx: number, patch: Partial<QuotationPaymentTerm>) =>
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
      const allocated = terms.slice(0, -1).reduce((sum, term) => {
        if (!Number.isFinite(term.percent)) return sum;
        return sum + Math.round(((outstanding * term.percent) / 100) * 100) / 100;
      }, 0);
      return Math.round(Math.max(0, outstanding - allocated) * 100) / 100;
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
        ? Math.round(((amount / outstanding) * 100) * 100_000_000) / 100_000_000
        : 0;
    updatePaymentTerm(idx, { percent });
  };
  const addPaymentTerm = () =>
    setTerms((current) =>
      balanceFinalQuotationPaymentTerm([
        ...current,
        { label: `งวดที่ ${current.length + 1} ชำระ`, percent: 0, due: "" },
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

  const termsProfile = getQuotationTermsProfile(
    mainPackage as unknown as Record<string, unknown> | undefined,
  );
  // ชุดที่ยังเท่ากับมาตรฐานเป๊ะไม่ต้องบันทึกลงใบ — ปล่อยให้ใบรับข้อความมาตรฐาน
  // เวอร์ชันล่าสุดตอนเรนเดอร์ จนกว่าจะมีคนแก้จริง ๆ
  const payloadDocumentInputs = {
    ...documentInputs,
    terms:
      documentInputs.terms &&
      !isStandardQuotationTermTree(documentInputs.terms, termsText)
        ? documentInputs.terms
        : null,
  };

  /** tree → payload ของ API (package_items = หัวข้อหลัก, items = หัวข้ออื่น + ลูก) */
  const serializeTree = () => {
    const packageItems = mainGroup
      ? [mainGroup.title, ...mainGroup.details].map((line) => ({
          package_item_id: line.package_item_id ?? null,
          item_name: line.item_name,
          quantity: Number(line.quantity) || 1,
          unit: line.unit || null,
        }))
      : [];
    const items = groups
      .filter((g) => g.key !== mainGroup?.key)
      .flatMap((g) => {
        const price = Number(g.price) || 0;
        const head =
          g.kind === "package"
            ? {
                source_type: "addon_package" as const,
                source_package_id: g.source_package_id,
                package_item_id: g.title.package_item_id ?? null,
                item_name: g.title.item_name,
                // ส่งจำนวน/หน่วยตามที่กรอกจริง — เดิม hard-code 1 กับ "ชุด"
                // เอกสารเลยพิมพ์ "… 1 ชุด" ต่อท้ายทุกใบ ทั้งที่ผู้ใช้ใส่ 20 ชุด
                // และทั้งที่บางแพ็กเกจไม่ได้ตั้งหน่วยไว้เลย
                quantity: Number(g.title.quantity) || 1,
                unit: g.title.unit || null,
                unit_price: price,
                line_total: price,
              }
            : {
                source_type: "custom_group" as const,
                item_name: g.title.item_name,
                quantity: Number(g.title.quantity) || 1,
                unit: g.title.unit || null,
                unit_price: price,
                line_total: price,
              };
        const detailType =
          g.kind === "package"
            ? ("addon_package_detail" as const)
            : ("custom_detail" as const);
        return [
          head,
          ...g.details.map((d) => ({
            source_type: detailType,
            source_package_id: g.source_package_id,
            package_item_id: d.package_item_id ?? null,
            item_name: d.item_name,
            quantity: Number(d.quantity) || 1,
            unit: d.unit || null,
            unit_price: 0,
            line_total: 0,
          })),
        ];
      });
    return { packageId: mainGroup?.source_package_id || null, packageItems, items };
  };

  const validate = () => {
    if (!groups.length) return "กรุณาเพิ่มแพ็กเกจ หรืองานเพิ่ม อย่างน้อย 1 รายการ";
    if (groups.some((g) => !g.title.item_name.trim()))
      return "กรุณาตั้งชื่อหัวข้อให้ครบทุกอัน";
    if (documentInputs.current_monthly_bill <= 0)
      return "กรุณาระบุค่าไฟปัจจุบันจากข้อมูลจริง";
    if (termsPercentTotal !== 100)
      return `ยอดรวมงวดชำระเงินต้องเท่ากับ 100% (ปัจจุบัน ${termsPercentTotal}%)`;
    if (issueDate > todayIso()) return "วันที่ใบเสนอราคาต้องไม่เป็นวันที่ล่วงหน้า";
    return "";
  };

  const previewQuotation = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.write(
        '<!doctype html><meta charset="utf-8"><title>กำลังสร้างตัวอย่าง…</title><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569">กำลังสร้างตัวอย่าง…</body>',
      );
    }
    try {
      const { packageItems, items } = serializeTree();
      const response = await fetch("/api/quotation-pdf/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getUserIdHeader() },
        body: JSON.stringify({
          lead,
          package: mainPackage ? { ...mainPackage, price: mainGroup?.price ?? mainPackage.price } : mainPackage,
          docNo: quote?.doc_no,
          issueDate,
          allItems: [
            ...packageItems.map((item) => ({
              ...item,
              source_type: "package",
              item_name_snapshot: item.item_name,
            })),
            ...items,
          ],
          discountLabel,
          deposit,
          subtotal,
          total,
          outstanding,
          terms,
          termsText,
          documentInputs: payloadDocumentInputs,
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
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { packageId, packageItems, items } = serializeTree();
      await apiFetch(
        quote ? `/api/quotations/${quote.id}` : `/api/leads/${lead.id}/quotations`,
        {
          method: quote ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            option_no: optionNo,
            package_id: packageId,
            // ราคาที่ผู้ใช้เลือกจากช่วงราคา (ไม่ส่ง = ใช้ราคาปัจจุบันของแพ็กเกจ)
            package_price: mainGroup?.price ?? null,
            package_items: packageItems,
            items,
            issue_date: issueDate,
            discount_type: discountType,
            discount_value: discountValue,
            discount_label: discountLabel,
            discount_reason: discountReason,
            deposit_paid_amount: deposit,
            payment_template_id: templateId,
            payment_terms: terms,
            terms_text: termsText,
            document_inputs: payloadDocumentInputs,
          }),
        },
      );
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };


  const CELL =
    "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-xxs text-gray-700 outline-none transition-colors placeholder:text-gray-300 hover:border-gray-200 focus:border-primary focus:bg-white";
  const FIELD =
    "h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none transition-colors placeholder:text-gray-300 hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-0 backdrop-blur-sm md:p-6">
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl md:h-[88vh] md:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900">ใบเสนอราคา ชุด {optionNo}</div>
            <div className="truncate text-xxs text-gray-400">
              {quote ? quote.doc_no : "เลขเอกสารสร้างอัตโนมัติเมื่อบันทึก"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </header>

        {error && (
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── ซ้าย: ต้นไม้รายการ (เลื่อนในกรอบตัวเอง หน้าไม่ยาว) ── */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-gray-100 md:border-b-0 md:border-r">
            {/* แท็บในตัว modal — ตัวแก้เงื่อนไขต้องการความกว้างเต็ม ใส่ในคอลัมน์ขวาไม่พอ */}
            <div className="flex shrink-0 gap-1 border-b border-gray-100 px-4 pt-2">
              {([
                ["items", "รายการในใบเสนอราคา"],
                ["terms", "เงื่อนไข/ข้อกำหนด"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`relative -mb-px h-10 rounded-t-lg border border-b-0 px-4 text-sm font-bold transition-colors ${
                    activeTab === key
                      ? "border-gray-200 bg-white text-primary"
                      : "border-transparent text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "items" && (
              <>
            <div className="flex shrink-0 items-center gap-2 px-4 py-2">
              <span className="text-xs font-bold text-gray-800">รายการในใบเสนอราคา</span>
              <span className="text-xxs text-gray-400">{groups.length} หัวข้อ</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={loadingPackage}
                  className="h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                >
                  {loadingPackage ? "กำลังดึงรายการ…" : "+ เพิ่มแพ็กเกจ"}
                </button>
                <button
                  type="button"
                  onClick={addCustomGroup}
                  className="h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  + งานเพิ่ม
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {groups.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-xs text-gray-400">
                  ยังไม่มีรายการ — เริ่มด้วย “+ เพิ่มแพ็กเกจ” หรือ “+ งานเพิ่ม”
                </div>
              )}
              <div className="space-y-2">
                {groups.map((g, gi) => (
                  <div key={g.key} className="rounded-xl border border-gray-200 bg-white">
                    {/* หัวข้อ = บรรทัดที่ขึ้นบนเอกสาร */}
                    {/* คลิกที่แถวหัวข้อตรงไหนก็กาง/หุบได้ — ยกเว้นช่องกรอกและปุ่ม */}
                    <div
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("input,textarea,button")) return;
                        toggleGroup(g.key);
                      }}
                      className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        aria-label={g.open ? "ย่อ" : "กาง"}
                        className="flex h-6 w-5 shrink-0 items-center justify-center text-gray-400 transition-transform hover:text-gray-600"
                      >
                        <span className={g.open ? "rotate-90" : ""}>▸</span>
                      </button>
                      {/* เลขข้อเหมือนบนเอกสาร (ลำดับเดียวกับตารางในใบเสนอราคา) */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold tabular-nums text-primary">
                        {gi + 1}
                      </span>
                      {/* ชื่อบนเอกสารมักยาว — ใช้ textarea ที่ยืดความสูงตามข้อความ
                          (ตัดบรรทัดได้ ไม่โดนตัดท้าย) */}
                      <textarea
                        value={g.title.item_name}
                        onChange={(e) =>
                          patchLine(g.key, g.title.key, { item_name: e.target.value })
                        }
                        rows={1}
                        ref={(el) => {
                          if (!el) return;
                          el.style.height = "auto";
                          el.style.height = `${el.scrollHeight}px`;
                        }}
                        placeholder={g.kind === "package" ? "ชื่อที่แสดงบนเอกสาร" : "ชื่องานเพิ่ม เช่น งานเพิ่มตู้คอนซูมเมอร์"}
                        aria-label="ชื่อหัวข้อบนเอกสาร"
                        className="min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold leading-snug text-gray-800 outline-none transition-colors placeholder:font-normal placeholder:text-gray-300 hover:border-gray-200 focus:border-primary focus:bg-white"
                      />
                      {/* จำนวน+หน่วยของบรรทัดแรก — เอกสารเอาไปต่อท้ายชื่อ
                          ("...ขนาดติดตั้งรวม 2.92 kWp" + "1 เฟส")
                          ความกว้างเท่าบรรทัดย่อยด้านล่าง คอลัมน์จะได้ตรงกันทั้งกลุ่ม */}
                      {g.kind === "package" && (
                        // ครอบด้วย div กำหนดความกว้าง — CELL มี w-full อยู่ข้างใน
                        // ถ้าใส่ w-14 ต่อท้าย CELL ตรง ๆ Tailwind จะให้ w-full ชนะ
                        // (ลำดับใน stylesheet ไม่ใช่ลำดับใน className) แถวจะล้นจนชื่อหด
                        // แพ็กเกจหลัก = ตัวที่ผูกกับใบเสนอราคาโดยตรง จำนวน/หน่วยของบรรทัดแรก
                        // ต้องมาจาก Package Master เท่านั้น แก้ที่นี่ไม่ได้ (ซื้อหลายชุดให้เพิ่ม
                        // เป็นแพ็กเกจรองแทน) · แพ็กเกจรองแก้จำนวนได้ ระบบคิดราคา/อุปกรณ์ให้เอง
                        <>
                          <div className="w-14 shrink-0">
                            <input
                              type="number"
                              min="0"
                              // ลบจนหมดต้องได้ช่องว่าง ไม่ใช่เลข 0 ค้างไว้ ไม่งั้นพิมพ์ต่อ
                              // จะกลายเป็น "010" แล้วตัวคูณเพี้ยนตามไปด้วย
                              // จำนวนบนแถวหัวข้อแก้ไม่ได้ทุกกลุ่ม — ค่ามาจาก Package Master
                              // ถ้าลูกค้าเอาหลายชุด ให้เพิ่มแพ็กเกจซ้ำ เอกสารจะพิมพ์
                              // ทุกแถวตามที่กรอกไว้ ไม่รวบให้
                              value={Number(g.title.quantity) > 0 ? g.title.quantity : ""}
                              readOnly
                              tabIndex={-1}
                              title="แก้จำนวนที่นี่ไม่ได้ — ค่ามาจาก Package Master"
                              aria-label="จำนวนของแพ็กเกจนี้"
                              className={`text-center cursor-default text-gray-400 hover:border-transparent ${CELL}`}
                            />
                          </div>
                          <div className="w-[72px] shrink-0">
                            <input
                              value={g.title.unit}
                              readOnly
                              tabIndex={-1}
                              placeholder="หน่วย"
                              title="แก้หน่วยที่นี่ไม่ได้ — ค่ามาจาก Package Master"
                              aria-label="หน่วยบนบรรทัดแรก"
                              className={`cursor-default text-gray-400 hover:border-transparent ${CELL}`}
                            />
                          </div>
                        </>
                      )}
                      {g.kind === "package" ? (
                        (() => {
                          const options = pricePeriods[g.source_package_id ?? -1] || [];
                          if (options.length < 2) {
                            return (
                              <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-gray-800">
                                {formatTHB(g.price)}
                              </span>
                            );
                          }
                          const open = openPriceKey === g.key;
                          return (
                            <div className="relative w-24 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (open) {
                                    setOpenPriceKey(null);
                                    return;
                                  }
                                  // ถ้าที่ว่างด้านล่างไม่พอ ให้กางขึ้นแทน — กันโดนขอบ modal ตัด
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  const needed = Math.min(options.length, 6) * 32 + 16;
                                  setPriceDropUp(spaceBelow < needed);
                                  setOpenPriceKey(g.key);
                                }}
                                title="เลือกราคาจากช่วงราคาที่ตั้งไว้"
                                className={`flex h-8 w-full items-center justify-end gap-1 rounded-md border px-1.5 text-xs font-bold tabular-nums text-gray-800 transition-colors ${
                                  open ? "border-primary bg-primary/5" : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                                }`}
                              >
                                {formatTHB(g.price)}
                                <span aria-hidden="true" className="text-xxs leading-none text-gray-400">▾</span>
                              </button>
                              {open && (
                                <>
                                  {/* ฉากโปร่งใสสำหรับปิดเมื่อคลิกที่อื่น — อยู่ใต้ตัว dropdown */}
                                  <div
                                    className="fixed inset-0 z-20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenPriceKey(null);
                                    }}
                                  />
                                  <div className={`absolute right-0 z-30 max-h-56 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
                                    priceDropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
                                    {options.map((option) => {
                                      const picked = Number(option.price) === Number(g.price);
                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            patchGroup(g.key, { price: Number(option.price) });
                                            setOpenPriceKey(null);
                                          }}
                                          className={`flex w-full items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-left transition-colors ${
                                            picked ? "bg-primary/10" : "hover:bg-gray-50"
                                          }`}
                                        >
                                          <span className={`flex-1 text-xxs ${option.is_active ? "text-green-600" : "text-gray-400"}`}>
                                            {periodRangeText(option)}
                                          </span>
                                          <span className={`text-xs font-bold tabular-nums ${option.is_active ? "text-green-700" : "text-gray-700"}`}>
                                            {formatTHB(option.price)}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={Number.isFinite(g.price) ? String(g.price) : ""}
                          onChange={(e) =>
                            patchGroup(g.key, { price: Math.max(0, Number(e.target.value) || 0) })
                          }
                          placeholder="ราคา"
                          title="ใส่ 0 ได้ — ถ้าเป็น 0 เอกสารจะแสดงเฉพาะชื่อรายการ ไม่มียอดเงินและหน่วย"
                          aria-label="ราคางานเพิ่ม"
                          className="h-8 w-24 shrink-0 rounded-md border border-gray-200 bg-white px-1.5 text-right text-xs font-bold tabular-nums text-gray-800 outline-none focus:border-primary"
                        />
                      )}
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => moveGroup(g.key, -1)}
                          disabled={gi === 0}
                          aria-label="เลื่อนขึ้น"
                          className="flex h-6 w-5 items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGroup(g.key, 1)}
                          disabled={gi === groups.length - 1}
                          aria-label="เลื่อนลง"
                          className="flex h-6 w-5 items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGroup(g.key)}
                          aria-label="ลบหัวข้อ"
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* รายละเอียดใต้หัวข้อ */}
                    {g.open && (
                      <div className="border-t border-gray-100 pb-1">
                        {g.details.map((d) => (
                          <div
                            key={d.key}
                            className="grid grid-cols-[minmax(0,1fr)_56px_72px_24px] items-center gap-1.5 py-0.5 pl-9 pr-2 hover:bg-primary/[0.03]"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              {/* จุดนำหน้า = บรรทัดรายการย่อยของหัวข้อด้านบน */}
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300"
                              />
                            <input
                              value={d.item_name}
                              onChange={(e) =>
                                patchLine(g.key, d.key, { item_name: e.target.value })
                              }
                              placeholder="ชื่ออุปกรณ์/บริการ"
                              className={CELL}
                            />
                            </div>
                            <input
                              type="number"
                              min="0"
                              // ลบจนหมดต้องเป็นช่องว่าง ไม่ใช่เลข 0 ค้าง ไม่งั้นพิมพ์ต่อได้ "010"
                              value={Number(d.quantity) > 0 ? d.quantity : ""}
                              onChange={(e) =>
                                patchLine(g.key, d.key, {
                                  quantity: Number(e.target.value.replace(/^0+(?=\d)/, "")),
                                  // แก้จำนวนเอง = ตั้งฐานต่อชุดใหม่ตามที่พิมพ์
                                  // ไม่งั้นพอไปแก้จำนวนชุดทีหลัง ค่าจะถูกดึงกลับไปฐานเดิม
                                  unitQuantity:
                                    Number(e.target.value.replace(/^0+(?=\d)/, "")) /
                                    (Number(g.title.quantity) || 1),
                                })
                              }
                              className={`text-center ${CELL}`}
                            />
                            <input
                              value={d.unit}
                              onChange={(e) =>
                                patchLine(g.key, d.key, { unit: e.target.value })
                              }
                              placeholder="หน่วย"
                              className={CELL}
                            />
                            <button
                              type="button"
                              onClick={() => removeDetail(g.key, d.key)}
                              aria-label="ลบรายละเอียด"
                              className="flex h-6 w-6 items-center justify-center rounded text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pl-9 pr-2 pt-1">
                          <button
                            type="button"
                            onClick={() => addDetail(g.key)}
                            className="rounded-md px-2 py-1 text-xxs font-semibold text-primary transition-colors hover:bg-primary/10"
                          >
                            + เพิ่มรายละเอียด
                          </button>
                          {g.kind === "package" && g.source_package_id && (
                            <button
                              type="button"
                              onClick={() => loadPackageGroup(g.source_package_id!, g.key)}
                              className="rounded-md px-2 py-1 text-xxs font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                              ↺ คืนค่าจาก Master
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
              </>
            )}

            {activeTab === "terms" && (
              <QuotationTermsEditor
                value={documentInputs.terms}
                profile={termsProfile}
                legacyTermsText={termsText}
                om={documentInputs.om}
                validDays={Number(quote?.valid_days) || 7}
                onChange={(next) =>
                  setDocumentInputs((current) => ({ ...current, terms: next }))
                }
              />
            )}
          </div>

          {/* ── ขวา: การเงิน (บีบให้พอดีจอ ไม่ต้องเลื่อน) ── */}
          <div className="flex w-full shrink-0 flex-col overflow-y-auto bg-slate-50/60 p-3 md:w-80">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="rounded-xl border border-gray-200 bg-white p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xxs text-gray-400">รวมรายการ</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-800">
                    {formatTHB(subtotal)}
                  </span>
                </div>
                {/* ส่วนลด: ชื่อ + % + บาท อยู่แถวเดียว */}
                <div className="mt-2 space-y-1.5">
                  <input
                    value={discountLabel}
                    maxLength={200}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="ชื่อส่วนลด"
                    className={FIELD}
                  />
                  <div className="grid grid-cols-2 gap-1.5">
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
                    placeholder="%"
                    className={`text-right ${FIELD}`}
                  />
                  <input
                    type="number"
                    min="0"
                    value={discountAmount || ""}
                    onChange={(e) => {
                      setDiscountType("amount");
                      setDiscountValue(Math.min(subtotal, Math.max(0, Number(e.target.value) || 0)));
                    }}
                    placeholder="บาท"
                    className={`text-right ${FIELD}`}
                  />
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-xxs text-gray-400">
                    {isFreeSurvey ? "ฟรีค่าสำรวจ" : "หักเงินจอง/ค่าสำรวจ"}
                  </span>
                  {isFreeSurvey || confirmedDeposit > 0 ? (
                    <span className="text-xs font-semibold tabular-nums text-gray-700">
                      {deposit > 0 ? `-${formatTHB(deposit)}` : formatTHB(0)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={deposit || ""}
                      onChange={(e) => setDeposit(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      className={`w-24 text-right ${FIELD}`}
                    />
                  )}
                </div>
                <div className="mt-1.5 flex items-baseline justify-between border-t border-gray-100 pt-1.5">
                  <span className="text-xs font-bold text-gray-700">ยอดสุทธิ</span>
                  <span className="text-lg font-bold tabular-nums text-primary">
                    {formatTHB(outstanding)}
                  </span>
                </div>
              </div>

              <div className="order-1 rounded-xl border border-gray-200 bg-white p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">งวดชำระเงิน</span>
                  <button
                    type="button"
                    onClick={addPaymentTerm}
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary hover:bg-primary/15"
                  >
                    + งวด
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  {terms.map((term, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[minmax(0,1fr)_72px_88px_18px] items-center gap-1"
                    >
                      <input
                        value={term.label}
                        maxLength={200}
                        onChange={(e) => updatePaymentTerm(index, { label: e.target.value })}
                        className={CELL}
                      />
                      {/* ช่อง % — ใหญ่ขึ้นและมีหน่วยกำกับ */}
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          disabled={index === terms.length - 1}
                          value={Number.isNaN(term.percent) ? "" : Math.round(term.percent * 100) / 100}
                          onChange={(e) =>
                            updatePaymentTerm(index, {
                              percent:
                                e.target.value === ""
                                  ? Number.NaN
                                  : Math.min(100, Math.max(0, Number(e.target.value))),
                            })
                          }
                          className="h-8 w-full rounded-md border border-gray-200 bg-white pl-1.5 pr-5 text-right text-xxs font-semibold tabular-nums text-gray-800 outline-none transition-colors hover:border-gray-300 focus:border-primary disabled:bg-gray-50 disabled:opacity-70"
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xxs text-gray-400">
                          %
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={outstanding <= 0 || index === terms.length - 1}
                        value={
                          Number.isNaN(getPaymentTermAmount(term.percent, index))
                            ? ""
                            : getPaymentTermAmount(term.percent, index)
                        }
                        onChange={(e) => updatePaymentTermAmount(index, e.target.value)}
                        className={`text-right font-semibold tabular-nums disabled:opacity-60 ${CELL}`}
                      />
                      <button
                        type="button"
                        disabled={terms.length === 1}
                        onClick={() => removePaymentTerm(index)}
                        aria-label={`ลบงวดที่ ${index + 1}`}
                        className="flex h-6 w-4 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <p
                  className={`mt-1 text-xxs ${
                    termsPercentTotal === 100 ? "text-gray-400" : "text-red-600"
                  }`}
                >
                  รวม {termsPercentTotal}% · งวดสุดท้ายปรับอัตโนมัติ
                </p>
              </div>

              <div className="order-3 rounded-xl border border-gray-200 bg-white p-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-xxs font-semibold text-gray-500">วันที่ใบเสนอราคา</span>
                  <input
                    type="date"
                    value={issueDate}
                    max={todayIso()}
                    onChange={(e) => setIssueDate(e.target.value || todayIso())}
                    className={`w-40 ${FIELD}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-gray-100 bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            ยกเลิก
          </button>
          {/* คำแนะนำการใช้งานที่คนมักไม่รู้ */}
          <span className="hidden text-xxs text-gray-400 lg:inline">
            💡 พิมพ์{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-gray-600">[ข้อความ]</code>{" "}
            ในชื่อรายการ → เอกสารแสดงเป็น <span className="font-bold text-red-600">(ข้อความ)</span>{" "}
            สีแดง · คลิกหัวข้อเพื่อกาง/หุบ
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={previewQuotation}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              ดูตัวอย่าง
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}
            </button>
          </div>
        </footer>
      </div>
      {pickerOpen && (
        <PackagePickerDialog
          groups={packageGroups}
          onPick={(id) => {
            setPickerOpen(false);
            loadPackageGroup(id);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
