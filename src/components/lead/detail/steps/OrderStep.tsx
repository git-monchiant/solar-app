"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/roles";
import type { StepCommonProps } from "./types";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import AddActivityModal from "@/components/lead/detail/AddActivityModal";
import PaymentSection from "@/components/payment/PaymentSection";
import { buildPaymentFlex } from "@/lib/utils/line-flex";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import ErrorPopup from "@/components/ui/ErrorPopup";
import CustomerInfoForm from "@/components/customer/CustomerInfoForm";
import FallbackImage from "@/components/ui/FallbackImage";
import PaymentSlipsThumbs from "@/components/payment/PaymentSlipsThumbs";
import StepLayout from "../StepLayout";
import ReceiptButtons from "../ReceiptButtons";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { useDialog } from "@/components/ui/Dialog";
import { formatTHB as fmt, formatThaiDate as formatDate } from "@/lib/utils/formatters";

type PayMethod = "transfer" | "loan";
type LoanBank = "ghb" | "gsb";

const LOAN_BANKS: { value: LoanBank; label: string }[] = [
  { value: "ghb", label: "ธอส. (อาคารสงเคราะห์)" },
  { value: "gsb", label: "ออมสิน" },
];

type Installment = {
  pct: number;
  when: "before" | "after";
  due_date: string | null;
  method: PayMethod;
  loan_bank: LoanBank | null;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseInstallments(raw: string | null | undefined, fallbackPctBefore: number): Installment[] {
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((r) => ({
          pct: Number(r?.pct) || 0,
          when: r?.when === "after" ? "after" : "before",
          due_date: typeof r?.due_date === "string" && r.due_date ? r.due_date : todayISO(),
          method: r?.method === "loan" ? "loan" : "transfer",
          loan_bank: r?.loan_bank === "ghb" || r?.loan_bank === "gsb" ? r.loan_bank : null,
        }));
      }
    } catch { /* fall through */ }
  }
  // Backward-compat: derive from order_pct_before — single row "before" if 100,
  // otherwise งวด 1 = pctBefore (before), งวด 2 = remainder (after).
  const today = todayISO();
  const base = { method: "transfer" as const, loan_bank: null };
  if (fallbackPctBefore >= 100) return [{ pct: 100, when: "before", due_date: today, ...base }];
  return [
    { pct: fallbackPctBefore, when: "before", due_date: today, ...base },
    { pct: 100 - fallbackPctBefore, when: "after", due_date: today, ...base },
  ];
}

const SUB_STEPS = [
  "ส่งลูกค้า",
  ["งวดชำระ", "งวดชำระเงิน"],
  "นัดหมาย",
  "ยืนยัน",
] as const;

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function OrderStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const { me } = useMe();
  const dialog = useDialog();
  const [subStep, setSubStep] = useSubStep(`orderSubStep_${lead.id}`, 0, SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(lead.order_total || lead.quotation_amount || 0);

  // Sync total with latest quotation_amount when it becomes available (user might arrive from QuoteStep
  // after quotation_amount was just saved; useState default only captures first render).
  useEffect(() => {
    if (!lead.order_total && lead.quotation_amount && total !== lead.quotation_amount) {
      setTotal(lead.quotation_amount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.quotation_amount, lead.order_total]);
  // Installment plan: array of {pct, when, due_date}. The legacy order_pct_before
  // is the sum of "before-install" rows — kept in sync so PaymentSection (which
  // splits its UI into งวด 1/2 based on pctBefore) keeps working.
  const [installments, setInstallments] = useState<Installment[]>(() =>
    parseInstallments(lead.order_installments, lead.order_pct_before ?? 100)
  );
  // Paid installments — locked from edits. Determined by confirmed payments
  // whose slip_field === "order_installment_<i>". Reload after each confirm.
  const [paidIdxSet, setPaidIdxSet] = useState<Set<number>>(new Set());
  // Map idx → payment id for confirmed installment rows. Needed so the inline
  // PaymentSection can show its admin "ถอย" button (it gates on slipUrl
  // pointing at /api/payments/<id>).
  const [paidIdToId, setPaidIdToId] = useState<Map<number, number>>(new Map());
  // Sum of pct from rows that aren't the auto-computed remainder row.
  // Auto row = highest-index unpaid row (or fallback to last row when no
  // payment data is loaded yet / nothing is paid).
  const _autoIdx = installments.length === 0
    ? -1
    : (() => {
        for (let k = installments.length - 1; k >= 0; k--) if (!paidIdxSet.has(k)) return k;
        return installments.length - 1;
      })();
  const earlierPctSum = installments.reduce((s, r, idx) => idx === _autoIdx ? s : s + (r.pct || 0), 0);
  const lastPct = Math.max(0, 100 - earlierPctSum);
  const persistedInstallments = installments.map((r, i) => i === _autoIdx ? { ...r, pct: lastPct } : r);
  const pctBefore = persistedInstallments.filter(r => r.when === "before").reduce((s, r) => s + r.pct, 0);

  // Allocate the survey deposit (depositPaid) as a credit against installments
  // walking BACKWARD from the last row. If the last row can absorb the full
  // 1,000 ค่าสำรวจ → credit lands there; otherwise spill into earlier rows.
  // Returns gross amount + credit per row → row.net = gross - credit.
  const setInstallmentCount = (n: number) => {
    if (n === installments.length) return;

    // Simulate the new array so we can pre-check whether the change would
    // mutate any paid row's persisted pct. Backend rejects 409 anyway, but
    // a synchronous alert here is much friendlier than a silent revert.
    const today = todayISO();
    const newInst: Installment[] = n > installments.length
      ? [
          ...installments,
          ...Array.from({ length: n - installments.length }, () => ({
            pct: 0, when: "before" as const, due_date: today, method: "transfer" as const, loan_bank: null,
          })),
        ]
      : installments.slice(0, n);

    // New auto-row = highest unpaid index in newInst, or last row as fallback.
    let newAutoIdx = newInst.length - 1;
    for (let k = newInst.length - 1; k >= 0; k--) {
      if (!paidIdxSet.has(k)) { newAutoIdx = k; break; }
    }
    const newEarlierSum = newInst.reduce((s, r, idx) => idx === newAutoIdx ? s : s + (r.pct || 0), 0);
    const newLastPct = Math.max(0, 100 - newEarlierSum);

    // For each paid row, its persisted pct in the new state must equal the current pct.
    const conflicts: number[] = [];
    paidIdxSet.forEach((idx) => {
      if (idx >= newInst.length) {
        conflicts.push(idx);  // got removed
        return;
      }
      const newPct = idx === newAutoIdx ? newLastPct : (newInst[idx]?.pct ?? 0);
      if (newPct !== installments[idx].pct) conflicts.push(idx);
    });

    if (conflicts.length > 0) {
      const list = conflicts.map(i => `งวดที่ ${i + 1}`).join(", ");
      dialog.alert({
        title: "ปรับจำนวนงวดไม่ได้",
        message: `${list} ชำระแล้ว — เปลี่ยนเป็น ${n} งวดจะกระทบ % ของงวดที่ชำระแล้ว ต้องถอน confirm ก่อน`,
        variant: "danger",
      });
      return;
    }

    setInstallments(newInst);
  };
  const updateInstallment = (i: number, patch: Partial<Installment>) => {
    setInstallments(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };
  // Zone (จากที่ตั้งไว้ตอน PreSurveyStep) — ให้แก้ใหม่ได้ที่ tab นัดหมาย
  const [zone, setZone] = useState<string>(lead.zone ?? "");
  const [zones, setZones] = useState<{ id: number; name: string; color: string }[]>([]);
  useEffect(() => {
    apiFetch("/api/zones").then(setZones).catch(console.error);
  }, []);
  // Which loan-row's follow-up modal is open.
  const [followupRow, setFollowupRow] = useState<number | null>(null);
  // Which row's PaymentSection is expanded inline. Each งวด has its own
  // slip_field (order_installment_<i>) so the payments table holds one
  // pending row per installment.
  const [paymentRow, setPaymentRow] = useState<number | null>(null);
  // Loan follow-up activities, fetched once + after each save. Keyed by row
  // installment index parsed from "[งวดที่ N]" prefix in activity title.
  type LoanFollowupActivity = { id: number; title: string; note: string | null; created_at: string; created_by_name: string | null; follow_up_date: string | null };
  const [loanActivities, setLoanActivities] = useState<LoanFollowupActivity[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const loadActivities = async () => {
    try {
      const all = await apiFetch(`/api/leads/${lead.id}/activities`) as Array<LoanFollowupActivity & { activity_type: string }>;
      setLoanActivities(all.filter(a => a.activity_type === "loan_followup"));
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadActivities(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);
  const followupsByRow = (idx: number) => loanActivities.filter(a => a.title.startsWith(`[งวดที่ ${idx + 1}]`));

  const loadPayments = async () => {
    try {
      const all = await apiFetch(`/api/payments?lead_id=${lead.id}`) as Array<{ id: number; slip_field: string; confirmed_at: string | null }>;
      const paid = new Set<number>();
      const idMap = new Map<number, number>();
      for (const p of all) {
        if (!p.confirmed_at || !p.slip_field) continue;
        const m = /^order_installment_(\d+)$/.exec(p.slip_field);
        if (m) {
          const idx = parseInt(m[1]);
          paid.add(idx);
          idMap.set(idx, p.id);
        }
      }
      setPaidIdxSet(paid);
      setPaidIdToId(idMap);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadPayments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);
  const isPaid = (idx: number) => paidIdxSet.has(idx);
  // Highest-index row that hasn't been paid — that's where the auto-computed
  // remainder goes (replaces the previous "last row" assumption).
  const lastUnpaidIdx = (() => {
    for (let k = installments.length - 1; k >= 0; k--) if (!paidIdxSet.has(k)) return k;
    return -1;
  })();
  const [installDate, setInstallDate] = useState(lead.install_date ? String(lead.install_date).slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [beforeSlipDone, setBeforeSlipDone] = useState(!!lead.order_before_slip);
  const [afterSlipDone, setAfterSlipDone] = useState(!!lead.order_after_slip);
  const [lineSending, setLineSending] = useState(false);
  // Initialize from the persisted "quotation_sent_date" set in QuoteStep submit
  // (and re-stamped on every re-send below). After refresh the button keeps its
  // ✓ state instead of looking like nothing happened.
  const [lineSent, setLineSent] = useState<boolean>(!!lead.quotation_sent_date);
  const [lineConfirm, setLineConfirm] = useState(false);
  const [regName, setRegName] = useState(lead.full_name || "");
  const [regIdCard, setRegIdCard] = useState(lead.id_card_number || "");
  const [regAddress, setRegAddress] = useState(lead.id_card_address || "");
  const [regInstallAddr, setRegInstallAddr] = useState(lead.installation_address || "");
  const [financeBank, setFinanceBank] = useState(lead.finance_bank ?? "");
  const [financeMonths, setFinanceMonths] = useState<string>(lead.finance_months != null ? String(lead.finance_months) : "");
  const [financeMonthly, setFinanceMonthly] = useState<string>(lead.finance_monthly != null ? String(lead.finance_monthly) : "");
  const [loanBank, setLoanBank] = useState(lead.finance_loan_bank ?? "");
  const [loanAmount, setLoanAmount] = useState<string>(lead.finance_loan_amount != null ? String(lead.finance_loan_amount) : "");
  const [loanDocs, setLoanDocs] = useState(lead.finance_documents ?? "");

  const pctAfter = 100 - pctBefore;
  // Single-installment (pctBefore = 100): customer already paid the deposit
  // (pre_total_price) at pre-survey, so the remaining before-install payment
  // is total − deposit. For split installments (pctBefore < 100) the deposit
  // is deducted on the งวด 2/2 line in InstallStep — but if deposit > งวด 2,
  // the excess credit spills back to งวด 1 (otherwise the customer would be
  // charged for งวด 1 even though they're already paid up).
  const depositPaid = lead.pre_total_price || 0;

  // Per-installment gross amount + deposit credit allocation.
  const rowGross = (idx: number) => {
    const pct = idx === _autoIdx ? lastPct : (installments[idx]?.pct ?? 0);
    return total > 0 ? Math.round((total * pct) / 100) : 0;
  };
  const rowCredits = (() => {
    const out = installments.map(() => 0);
    let remaining = depositPaid;
    for (let i = installments.length - 1; i >= 0 && remaining > 0; i--) {
      const c = Math.min(rowGross(i), remaining);
      out[i] = c;
      remaining -= c;
    }
    return out;
  })();
  const rowNet = (idx: number) => Math.max(0, rowGross(idx) - rowCredits[idx]);
  // Gross amount per side (deposit is NOT pre-deducted here — the credit
  // allocator below distributes the deposit to one or both sides). Otherwise
  // we'd double-count the deposit and refund it back even when it covered the
  // installments correctly.
  const amountBefore = total > 0
    ? (pctBefore >= 100 ? total : Math.round(total * pctBefore / 100))
    : 0;
  const amountAfter = total > 0 && pctBefore < 100 ? total - Math.round(total * pctBefore / 100) : 0;
  // Distribute deposit credit: งวด 2 first, then spill to งวด 1, then refund.
  const creditAfter = Math.min(amountAfter, depositPaid);
  const creditBefore = Math.min(amountBefore, depositPaid - creditAfter);
  const netBefore = amountBefore - creditBefore;
  const netAfter = amountAfter - creditAfter;
  const refund = depositPaid - creditAfter - creditBefore;

  // Build the auto-save payload from current state. Used both by the debounce
  // autosave (below) and the synchronous flushSave called when the user clicks
  // "ถัดไป" — the latter guarantees the latest values land in DB before the
  // sub-step advances (otherwise a fast click within the 800ms debounce window
  // could lose the most recent change).
  const buildSavePayload = useCallback(() => ({
    order_total: total || null,
    order_pct_before: pctBefore,
    order_pct_after: pctAfter,
    order_installments: JSON.stringify(persistedInstallments),
    install_date: installDate || null,
    finance_bank: financeBank || null,
    finance_months: financeMonths ? parseInt(financeMonths) : null,
    finance_monthly: financeMonthly ? parseFloat(financeMonthly) : null,
    finance_loan_bank: loanBank || null,
    finance_loan_amount: loanAmount ? parseFloat(loanAmount) : null,
    finance_documents: loanDocs || null,
  }), [total, pctBefore, pctAfter, persistedInstallments, installDate, financeBank, financeMonths, financeMonthly, loanBank, loanAmount, loanDocs]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload()),
      });
    } catch (e) { console.error(e); }
  }, [lead.id, buildSavePayload]);

  // Debounced auto-save
  useEffect(() => {
    if (state !== "active") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload()),
      }).catch(console.error);
      saveTimerRef.current = null;
    }, 800);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, pctBefore, installments, installDate, financeBank, financeMonths, financeMonthly, loanBank, loanAmount, loanDocs]);

  // PaymentSection writes the payments row + flips the paid flag itself. Parent just
  // reacts after the fact — tracks local UI state and refreshes the lead.
  // Payment confirmations stay on the current sub-step — user advances
  // manually via "ถัดไป" so they see the state flip before moving on.
  const onBeforeConfirmed = async () => {
    const patch: Record<string, unknown> = {};
    if (pctBefore >= 100) patch.status = "install";
    if (me?.id) patch.order_before_paid_by = me.id;
    if (Object.keys(patch).length) {
      try { await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); } catch {}
    }
    await refresh();
  };
  const onAfterConfirmed = async () => {
    const patch: Record<string, unknown> = { status: "install" };
    if (me?.id) patch.order_after_paid_by = me.id;
    try { await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); } catch {}
    await refresh();
  };

  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const doneTotal = lead.order_total || 0;
  const donePctBefore = lead.order_pct_before ?? 100;
  const donePctAfter = 100 - donePctBefore;
  // Gross — do NOT pre-deduct deposit. Credit allocator below applies it.
  const doneAmtBefore = donePctBefore >= 100
    ? doneTotal
    : Math.round(doneTotal * donePctBefore / 100);
  const doneAmtAfter = donePctAfter > 0 ? doneTotal - Math.round(doneTotal * donePctBefore / 100) : 0;
  const doneDeposit = lead.pre_total_price || 0;
  const doneCreditAfter = Math.min(doneAmtAfter, doneDeposit);
  const doneCreditBefore = Math.min(doneAmtBefore, doneDeposit - doneCreditAfter);
  const doneNetBefore = doneAmtBefore - doneCreditBefore;
  const doneNetAfter = doneAmtAfter - doneCreditAfter;
  const doneRefund = doneDeposit - doneCreditAfter - doneCreditBefore;

  const renderDoneContent = () => (
    <>
      {doneTotal > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-700 font-semibold">ยอดรวม</span>
            <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(doneTotal)} บาท</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">ชำระก่อนติดตั้ง {donePctBefore}%</span>
            <span className="font-mono tabular-nums text-gray-400">{fmt(doneAmtBefore)} บาท</span>
          </div>
          {donePctAfter > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">ชำระหลังติดตั้ง</span>
              <span className="font-mono tabular-nums text-gray-400">{fmt(doneAmtAfter)} บาท</span>
            </div>
          )}
          {doneDeposit > 0 ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">หักค่าสำรวจ</span>
                <span className="font-mono tabular-nums text-gray-400">-{fmt(doneDeposit)} บาท</span>
              </div>
              {donePctAfter > 0 ? (
                <>
                  <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                    <span className="text-gray-700 font-semibold">ยอดชำระก่อนติดตั้งสุทธิ</span>
                    <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(doneNetBefore)} บาท</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700 font-semibold">ยอดชำระหลังติดตั้งสุทธิ</span>
                    <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(doneNetAfter)} บาท</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                  <span className="text-gray-700 font-semibold">ยอดชำระสุทธิ</span>
                  <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(doneNetBefore)} บาท</span>
                </div>
              )}
              {doneRefund > 0 && (
                <div className="flex justify-between border-t border-emerald-100 pt-1 mt-1 text-emerald-700">
                  <span className="font-semibold">คืนเงินลูกค้า</span>
                  <span className="font-bold font-mono tabular-nums">{fmt(doneRefund)} บาท</span>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
      {lead.install_date && (
        <div className="border-l-3 border-amber-400 pl-3">
          <div className="text-xs font-bold text-amber-600 uppercase mb-1">กำหนดเข้าติดตั้ง</div>
          <div className="font-semibold text-gray-800">{formatDate(lead.install_date)}</div>
        </div>
      )}

      {lead.order_before_slip && (
        <div className="border-l-3 border-violet-400 pl-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-bold text-violet-600 uppercase">สลิปก่อนติดตั้ง</div>
            <div className="text-sm font-bold font-mono tabular-nums text-gray-900">{fmt(doneAmtBefore)} บาท</div>
          </div>
          <PaymentSlipsThumbs slipUrl={lead.order_before_slip} label="สลิปก่อนติดตั้ง" />
        </div>
      )}


      {(lead.full_name || lead.id_card_number || lead.id_card_address || lead.installation_address) && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">ข้อมูลขออนุญาตติดตั้ง</div>
          <div className="space-y-0.5">
            {lead.full_name && <div className="flex justify-between"><span className="text-gray-400">ชื่อ-นามสกุล</span><span className="text-gray-800 text-right">{lead.full_name}</span></div>}
            {lead.id_card_number && <div className="flex justify-between"><span className="text-gray-400">เลขบัตร ปชช.</span><span className="font-mono tabular-nums text-gray-800">{lead.id_card_number}</span></div>}
            {lead.id_card_address && <div className="flex flex-col"><span className="text-gray-400">ที่อยู่ตามบัตร</span><span className="text-gray-800">{lead.id_card_address}</span></div>}
            {lead.installation_address && <div className="flex flex-col"><span className="text-gray-400">ที่อยู่ติดตั้ง</span><span className="text-gray-800">{lead.installation_address}</span></div>}
          </div>
        </div>
      )}

      {lead.order_before_paid && (
        <div className="pt-3 border-t border-gray-100">
          <ReceiptButtons leadId={lead.id} stage="order_before" fileLabel={`${lead.pre_doc_no || `lead_${lead.id}`}_before`} />
        </div>
      )}
    </>
  );

  const gateCheck = (from: number): string[] => {
    const missing: string[] = [];
    if (from === 1 && (!total || total <= 0)) missing.push("ยอดรวม");
    if (from === 1 && depositPaid > 0 && total > 0 && total < depositPaid) {
      missing.push(`ยอดต้องไม่ต่ำกว่าค่าสำรวจ (฿${fmt(depositPaid)})`);
    }
    if (from === 1 && (pctBefore === null || pctBefore === undefined)) missing.push("% ชำระก่อนติดตั้ง");
    // Leaving "งวดชำระ" requires every "before-install" row to be confirmed,
    // regardless of method. Loan rows count as confirmed only after the bank
    // disburses (admin confirms via the loan flow's "ยืนยันรับเงิน" action,
    // which writes confirmed_at on the payment row just like a transfer).
    // Rows whose net is 0 (deposit fully covers the gross) are skipped — the
    // customer doesn't owe anything, so there's nothing to confirm.
    if (from === 1) {
      const unpaidBefore = persistedInstallments
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.when === "before")
        .filter(({ i }) => rowNet(i) > 0)
        .filter(({ i }) => !paidIdxSet.has(i));
      if (unpaidBefore.length > 0) {
        missing.push(`รับชำระงวดก่อนติดตั้งยังไม่ครบ (เหลือ ${unpaidBefore.length} งวด)`);
      }
    }
    if (from === 2 && !installDate) missing.push("วันนัดติดตั้ง");
    return missing;
  };
  const handleSubStepChange = async (n: number) => {
    if (n > subStep) {
      const missing = gateCheck(subStep);
      if (missing.length > 0) { setNextError(missing.join(", ")); return; }
      await flushSave();
    }
    setNextError(null);
    setSubStep(n);
  };

  return (
    <StepLayout
      state={state}
      subSteps={SUB_STEPS}
      subStep={subStep}
      onSubStepChange={handleSubStepChange}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={
        <>
          <span className="text-sm font-semibold text-gray-900 flex-1">{lead.install_date ? `กำหนดเข้าติดตั้ง ${formatDate(lead.install_date)}` : "ยืนยันการชำระ"}</span>
          {lead.order_before_paid && (
            <div className="mr-4"><ReceiptButtons leadId={lead.id} stage="order_before" fileLabel={`${lead.pre_doc_no || `lead_${lead.id}`}_before`} compact /></div>
          )}
        </>
      }
      renderDone={renderDoneContent}
    >
      {/* Step 1: ชุดการชำระเงิน (ราคา + งวด) */}
      {subStep === 1 && (
        <div className="space-y-3">
          {lead.quotation_files && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
              <div className="text-xs font-bold text-orange-600 uppercase mb-2">ไฟล์ใบเสนอราคา</div>
              <div className="space-y-1.5">
                {lead.quotation_files.split(",").filter(Boolean).map((url, i) => {
                  const fileName = url.split("/").pop() || `ไฟล์ ${i + 1}`;
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                  return (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-orange-100 hover:bg-orange-50 transition-colors">
                      <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={isImage ? "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" : "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                      </svg>
                      <span className="text-sm text-orange-700 font-semibold truncate">{fileName}</span>
                    </a>
                  );
                })}
              </div>
              {lead.quotation_note && <div className="text-xs text-orange-600 mt-2">{lead.quotation_note}</div>}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">จำนวนเงินตามใบเสนอราคา (บาท)</label>
            <input type="number" value={total || ""} onChange={e => setTotal(parseFloat(e.target.value) || 0)} placeholder="0"
              min={depositPaid || 0}
              className={`w-full h-14 px-3 rounded-lg border text-2xl font-bold font-mono focus:outline-none ${
                depositPaid > 0 && total > 0 && total < depositPaid
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-primary"
              }`} />
            {depositPaid > 0 && total > 0 && total < depositPaid && (
              <div className="text-xs text-red-600 mt-1">
                ต้องไม่ต่ำกว่าค่าสำรวจที่จ่ายแล้ว (฿{fmt(depositPaid)})
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">งวดการชำระเงิน</label>
            <div className="flex items-center gap-1.5 mb-3">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInstallmentCount(n)}
                  className={`h-9 px-4 rounded-lg text-sm font-semibold border transition-all ${
                    installments.length === n
                      ? "bg-active text-white border-active"
                      : "bg-white text-gray-600 border-gray-200 hover:border-active/40"
                  }`}
                >
                  {n} งวด
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {installments.map((row, i) => {
                const isAutoRow = i === _autoIdx;
                const paid = isPaid(i);
                const rowAmount = rowGross(i);
                const rowCredit = rowCredits[i] || 0;
                const rowNetAmount = rowNet(i);
                const loanCheckbox = (
                  <label className={`flex items-center gap-1.5 text-xs text-gray-600 shrink-0 ${paid ? "cursor-default opacity-60" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={row.method === "loan"}
                      disabled={paid}
                      onChange={(e) => updateInstallment(i, e.target.checked
                        ? { method: "loan", loan_bank: row.loan_bank || LOAN_BANKS[0].value }
                        : { method: "transfer", loan_bank: null })}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>สินเชื่อ</span>
                  </label>
                );
                const bankPicker = row.method === "loan" ? (
                  <select
                    value={row.loan_bank || ""}
                    disabled={paid}
                    onChange={e => updateInstallment(i, { loan_bank: e.target.value as LoanBank })}
                    className={`w-full md:w-auto h-9 px-2 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary ${paid ? "opacity-60" : ""}`}
                  >
                    {LOAN_BANKS.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                ) : null;
                const paymentOpen = paymentRow === i;
                const noNet = rowNetAmount === 0 && total > 0;
                const recordPaymentBtn = (
                  <button
                    type="button"
                    disabled={noNet}
                    onClick={(e) => { e.stopPropagation(); if (noNet) return; setPaymentRow(paymentOpen ? null : i); }}
                    className={`h-9 px-3 rounded-md border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                      noNet
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default"
                        : paid
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : paymentOpen
                            ? "bg-active text-white border-active"
                            : "border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5"
                    }`}
                  >
                    {noNet ? (
                      <>✓ ไม่มียอดต้องเก็บ</>
                    ) : paid ? (
                      <>ชำระแล้ว</>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                        </svg>
                        บันทึกรับชำระ
                      </>
                    )}
                  </button>
                );
                const rowFollowups = row.method === "loan" ? followupsByRow(i) : [];
                const expanded = expandedRow === i;
                return (
                  <div key={i} className={`rounded-lg border p-2 transition-colors ${paid ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
                    {/* Mobile: 12-col grid (existing) · Desktop: flex single line */}
                    <div className="grid grid-cols-12 gap-2 items-center md:flex md:flex-wrap">
                      <div className="order-1 col-span-7 md:w-24 text-xs font-semibold text-gray-700 md:shrink-0 flex items-center gap-1">
                        {row.method === "loan" ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedRow(expanded ? null : i); }}
                            disabled={rowFollowups.length === 0}
                            title={rowFollowups.length === 0 ? "ยังไม่มีบันทึกการติดตาม" : `ดูบันทึกการติดตาม (${rowFollowups.length})`}
                            className="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded text-active hover:bg-active/10 disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        ) : (
                          <span className="shrink-0 w-5 h-5" aria-hidden />
                        )}
                        {paid && (
                          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                        <span className={paid ? "text-emerald-800" : ""}>{`งวดที่ ${i + 1}`}</span>
                        {row.method === "loan" && rowFollowups.length > 0 && (
                          <span className="text-[10px] text-active font-mono tabular-nums">({rowFollowups.length})</span>
                        )}
                      </div>
                      <div className="hidden md:block md:w-20 relative md:shrink-0 md:order-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={isAutoRow ? lastPct : row.pct}
                          disabled={isAutoRow || paid}
                          onChange={e => {
                            const digits = e.target.value.replace(/[^\d]/g, "");
                            const v = digits === "" ? 0 : Math.min(100, parseInt(digits));
                            updateInstallment(i, { pct: v });
                          }}
                          className={`w-full h-9 pl-2 pr-7 rounded-md border text-sm font-mono tabular-nums focus:outline-none ${isAutoRow || paid ? "bg-gray-50 border-gray-200 text-gray-700" : "border-gray-200 focus:border-primary"}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                      </div>
                      {/* "ชำระหลังติดตั้ง" — desktop column */}
                      <div className="hidden md:block md:order-3 md:shrink-0">
                        <label className={`flex items-center gap-1.5 text-xs text-gray-600 h-9 ${paid ? "cursor-default opacity-60" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            checked={row.when === "after"}
                            disabled={paid}
                            onChange={(e) => updateInstallment(i, { when: e.target.checked ? "after" : "before" })}
                            className="w-4 h-4 accent-primary"
                          />
                          <span>ชำระหลังติดตั้ง</span>
                        </label>
                      </div>
                      {/* Amount cell: fixed-width wrapper so the numeric value lines up across rows even when a follow-up hint is present. */}
                      <div className="order-2 col-span-5 md:order-last md:w-56 flex items-center justify-end gap-2 md:shrink-0">
                        {row.method === "loan" && rowFollowups.length > 0 && (() => {
                          const next = rowFollowups.find(a => !!a.follow_up_date);
                          return next ? (
                            <span className="hidden md:inline text-xs text-gray-500 font-normal whitespace-nowrap">(กำหนดติดตาม {formatDate(next.follow_up_date)})</span>
                          ) : null;
                        })()}
                        <span className="w-full md:w-24 text-right text-sm font-mono tabular-nums text-gray-700">
                          {total > 0 ? fmt(rowNetAmount) : "—"} ฿
                          {rowCredit > 0 && (
                            <span className="block text-[10px] font-sans text-gray-400 font-normal whitespace-nowrap">หักค่าสำรวจ -{fmt(rowCredit)}</span>
                          )}
                        </span>
                      </div>
                      {/* Desktop: loan checkbox + bank picker + buttons inline at end of row */}
                      <div className="hidden md:flex items-center gap-2 md:ml-auto md:order-last">
                        {loanCheckbox}
                        {bankPicker}
                        {recordPaymentBtn}
                      </div>
                    </div>
                    {/* Mobile redesign — clear sections, full-width actions */}
                    <div className="mt-2 md:hidden space-y-2">
                      {/* Row: % + สินเชื่อ + ชำระหลังติดตั้ง */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative w-20 shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={isAutoRow ? lastPct : row.pct}
                            disabled={isAutoRow || paid}
                            onChange={e => {
                              const digits = e.target.value.replace(/[^\d]/g, "");
                              const v = digits === "" ? 0 : Math.min(100, parseInt(digits));
                              updateInstallment(i, { pct: v });
                            }}
                            className={`w-full h-9 pl-2 pr-7 rounded-md border text-sm font-mono tabular-nums focus:outline-none ${isAutoRow || paid ? "bg-gray-50 border-gray-200 text-gray-700" : "border-gray-200 focus:border-primary"}`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                        </div>
                        {loanCheckbox}
                        <label className={`flex items-center gap-1.5 text-xs text-gray-600 ${paid ? "cursor-default opacity-60" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            checked={row.when === "after"}
                            disabled={paid}
                            onChange={(e) => updateInstallment(i, { when: e.target.checked ? "after" : "before" })}
                            className="w-4 h-4 accent-primary"
                          />
                          <span>ชำระหลังติดตั้ง</span>
                        </label>
                      </div>
                      {/* Loan-only: bank dropdown — follow-up date is set per
                          activity in the AddActivityModal, not here */}
                      {row.method === "loan" && bankPicker && (
                        <div>{bankPicker}</div>
                      )}
                      {/* Action button: บันทึกรับชำระ / ชำระแล้ว — full width */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPaymentRow(paymentOpen ? null : i); }}
                        className={`w-full h-10 rounded-md border text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                          paid
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : paymentOpen
                              ? "bg-active text-white border-active"
                              : "border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5"
                        }`}
                      >
                        {paid ? (
                          <>ชำระแล้ว</>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                            </svg>
                            บันทึกรับชำระ
                          </>
                        )}
                      </button>
                    </div>
                    {/* Inline PaymentSection — slip_field is per-installment so each row gets its own pending payments row */}
                    {paymentOpen && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <PaymentSection
                          hideHeader
                          onlyOther={row.method === "loan"}
                          paymentTitle={`งวดที่ ${i + 1} · ค่าระบบ Solar Rooftop (${isAutoRow ? lastPct : row.pct}%)`}
                          amountLabel={`งวดที่ ${i + 1}/${installments.length}`}
                          amount={rowNetAmount}
                          leadId={lead.id}
                          leadName={lead.full_name}
                          lineId={lead.line_id}
                          slipUrl={paid && paidIdToId.has(i) ? `/api/payments/${paidIdToId.get(i)}` : null}
                          slipField={`order_installment_${i}`}
                          paymentNote={`ค่าระบบ Solar Rooftop · งวดที่ ${i + 1}`}
                          stepNo={10 + i}
                          description={`งวดที่ ${i + 1}`}
                          docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-${i + 1}` : null}
                          confirmed={paid}
                          onConfirmed={async () => { await refresh(); await loadPayments(); }}
                          onUndone={async () => { await refresh(); await loadPayments(); }}
                        />
                      </div>
                    )}
                    {/* Follow-up history table — collapsed by default, toggled via chevron */}
                    {row.method === "loan" && rowFollowups.length > 0 && expanded && (
                      <>
                        <div className="mt-2 -mx-2 border-t border-gray-100 overflow-x-auto">
                          <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-100">
                                  <th className="px-2 py-1.5 text-left font-semibold">วันเวลา</th>
                                  <th className="px-2 py-1.5 text-left font-semibold">ช่องทาง</th>
                                  <th className="px-2 py-1.5 text-left font-semibold">บันทึก</th>
                                  <th className="px-2 py-1.5 text-left font-semibold">กำหนดติดตาม</th>
                                  <th className="px-2 py-1.5 text-left font-semibold">ผู้บันทึก</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rowFollowups.map(a => (
                                  <tr key={a.id} className="border-b border-gray-50 last:border-0 align-top">
                                    <td className="px-2 py-1.5 text-gray-500 font-mono tabular-nums whitespace-nowrap">{formatDate(a.created_at, { time: true })}</td>
                                    <td className="px-2 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{a.title.replace(/^\[งวดที่ \d+\]\s*/, "")}</td>
                                    <td className="px-2 py-1.5 text-gray-700 whitespace-pre-wrap">{a.note || "—"}</td>
                                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{a.follow_up_date ? formatDate(a.follow_up_date) : "—"}</td>
                                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{a.created_by_name || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {earlierPctSum > 100 && (
              <div className="mt-2 text-xs text-red-500">รวม % เกิน 100 ({earlierPctSum}%) — ลด % ของงวดก่อนหน้าลง</div>
            )}

            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">ยอดรวม</span>
                <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(total)} บาท</span>
              </div>
              {pctBefore < 100 && total > 0 ? (
                <>
                  <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                    <span className="text-gray-600">ยอดชำระก่อนติดตั้งสุทธิ</span>
                    <span className="font-bold font-mono text-gray-900">{fmt(netBefore)} บาท</span>
                  </div>
                  {depositPaid > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>หักค่าสำรวจ</span>
                      <span>-{fmt(depositPaid)} บาท</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-600">ยอดชำระหลังติดตั้งสุทธิ</span>
                    <span className="font-bold font-mono text-gray-900">{fmt(netAfter)} บาท</span>
                  </div>
                </>
              ) : (
                <>
                  {depositPaid > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>หักค่าสำรวจ</span>
                      <span>-{fmt(depositPaid)} บาท</span>
                    </div>
                  )}
                  {depositPaid > 0 && (
                    <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                      <span className="text-gray-600">ยอดที่ต้องชำระ</span>
                      <span className="font-bold font-mono text-gray-900">{fmt(total - depositPaid)} บาท</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Send Quotation to customer via LINE */}
          <button
            type="button"
            disabled={lineSending || !lead.line_id}
            onClick={() => setLineConfirm(true)}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
              !lead.line_id ? "bg-gray-200 text-gray-400 cursor-not-allowed" : lineSent ? "bg-emerald-500 text-white" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
            {!lead.line_id ? "ยังไม่ได้เชื่อม LINE" : lineSending ? "กำลังส่ง..." : lineSent ? "✓ ส่งแล้ว · คลิกเพื่อส่งอีกครั้ง" : "ส่งใบเสนอราคาให้ลูกค้า"}
          </button>

          {lineConfirm && (
            <LineConfirmModal
              name={lead.full_name}
              description="ส่งใบเสนอราคาทาง LINE"
              onCancel={() => setLineConfirm(false)}
              onConfirm={async () => {
                setLineConfirm(false);
                setLineSending(true);
                try {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  // quotation_files is CSV of URLs — LINE button needs a single valid
                  // URI, so pick the first file only.
                  const firstFile = (lead.quotation_files || "").split(",").filter(Boolean)[0] || "";
                  const downloadUrl = firstFile.startsWith("http") ? firstFile : `${origin}${firstFile}`;
                  const deposit = depositPaid;
                  const details: { label: string; value: string }[] = [];
                  details.push({ label: "ยอดรวม", value: `฿${fmt(total)}` });
                  if (deposit > 0) {
                    details.push({ label: "หักค่าสำรวจ", value: `-฿${fmt(deposit)}` });
                    details.push({ label: "ยอดที่ต้องชำระ", value: `฿${fmt(total - deposit)}` });
                  }
                  // Installment plan — one line per งวด with timing + method.
                  const bankLabel: Record<string, string> = { ghb: "ธอส.", gsb: "ออมสิน" };
                  persistedInstallments.forEach((r, idx) => {
                    const amt = total > 0 ? Math.round((total * r.pct) / 100) : 0;
                    const method = r.method === "loan"
                      ? `สินเชื่อ${r.loan_bank ? ` ${bankLabel[r.loan_bank] || r.loan_bank}` : ""}`
                      : "เงินโอน/QR";
                    details.push({
                      label: `งวดที่ ${idx + 1} · ${method}`,
                      value: `฿${fmt(amt)} (${r.pct}%)`,
                    });
                  });
                  const messages = [buildPaymentFlex({
                    origin, title: "ใบเสนอราคา", amount: total, name: lead.full_name,
                    actionLabel: "รายละเอียดใบเสนอราคา", actionUrl: downloadUrl, details,
                  })];
                  await apiFetch("/api/line/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead_id: lead.id, messages }),
                  });
                  // Persist the latest send time so a refresh keeps the ✓ state.
                  await apiFetch(`/api/leads/${lead.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quotation_sent_date: new Date().toISOString().slice(0, 10) }),
                  }).catch(console.error);
                  setLineSent(true);
                } catch {
                  setLineSent(false);
                } finally {
                  setLineSending(false);
                }
              }}
            />
          )}
        </div>
      )}

      {/* Step 2: นัดหมาย */}
      {subStep === 2 && (
        <div className="space-y-3">
          <div className="rounded-lg border border-active/15 bg-white/60 p-4">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">Zone</label>
            <div className="grid grid-cols-1 gap-2">
              {zones.map(z => (
                <button key={z.id} type="button" onClick={() => {
                  setZone(z.name);
                  apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: z.name }) }).catch(console.error);
                }} className={`w-full h-10 rounded-lg text-sm font-semibold border transition-all text-left px-4 ${zone === z.name ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}>
                  {z.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">กำหนดเข้าติดตั้ง</label>
            <CalendarPicker date={installDate} timeSlot="" onDateChange={setInstallDate} onTimeSlotChange={() => {}} showTimeSlot={false} showSurveySlots excludeLeadId={lead.id} zoneFilter={zone} />
          </div>
        </div>
      )}

      {/* Step 0: ส่งใบเสนอราคาให้ลูกค้า */}
      {subStep === 0 && (
        <div className="space-y-3">
          {lead.quotation_files && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
              <div className="text-xs font-bold text-orange-600 uppercase mb-2">ไฟล์ที่จะส่ง</div>
              {lead.quotation_files.split(",").filter(Boolean).map((url, i) => {
                const fileName = url.split("/").pop() || `ไฟล์ ${i + 1}`;
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                return (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-orange-100 hover:bg-orange-50 transition-colors">
                    <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={isImage ? "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" : "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                    </svg>
                    <span className="text-sm text-orange-700 font-semibold truncate">{fileName}</span>
                  </a>
                );
              })}
              {lead.quotation_note && <div className="text-xs text-orange-600 mt-2">{lead.quotation_note}</div>}
            </div>
          )}

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดรวม</span>
              <span className="font-bold font-mono">{fmt(total)} บาท</span>
            </div>
            {pctBefore < 100 && (<>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ชำระก่อนติดตั้ง {pctBefore}%</span>
                <span>{fmt(amountBefore)} บาท</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ชำระหลังติดตั้ง</span>
                <span>{fmt(amountAfter)} บาท</span>
              </div>
            </>)}
            {depositPaid > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(depositPaid)} บาท</span>
              </div>
            )}
            {pctBefore >= 100 ? (
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                <span className="text-gray-600">ยอดชำระสุทธิ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(netBefore)} บาท</span>
              </div>
            ) : (<>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                <span className="text-gray-600">ยอดชำระก่อนติดตั้งสุทธิ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(netBefore)} บาท</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-600">ยอดชำระหลังติดตั้งสุทธิ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(netAfter)} บาท</span>
              </div>
            </>)}
            {refund > 0 && (
              <div className="flex justify-between text-sm font-semibold text-emerald-700 border-t border-emerald-200 pt-1">
                <span>คืนเงินลูกค้า</span>
                <span className="font-bold font-mono">{fmt(refund)} บาท</span>
              </div>
            )}
          </div>

        </div>
      )}


      {/* Step 3: ยืนยันข้อมูลขออนุญาต */}
      {subStep === 3 && (
        <div className="space-y-3">
          <CustomerInfoForm
            values={{}}
            onChange={(patch) => {
              // Skip full_name — don't overwrite from OCR
              if (patch.id_card_number) setRegIdCard(patch.id_card_number.slice(0, 13));
              if (patch.id_card_address) setRegAddress(patch.id_card_address);
              if (patch.installation_address) setRegInstallAddr(patch.installation_address);
            }}
            fields={[]}
            showScan
          />
          <div className="rounded-lg border border-active/15 bg-white/60 p-3 space-y-2.5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลขออนุญาตติดตั้ง</div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ชื่อ-นามสกุล</label>
              <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน</label>
              <input type="text" inputMode="numeric" maxLength={13} value={regIdCard} onChange={e => setRegIdCard(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก" className="w-full h-10 px-3 rounded-lg border border-gray-200 font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน</label>
              <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ติดตั้ง</label>
              <textarea value={regInstallAddr} onChange={e => setRegInstallAddr(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
            </div>
          </div>

        </div>
      )}

      {/* Navigation buttons — hidden on the last sub-step (the main action button takes over) */}
      {subStep < SUB_STEPS.length - 1 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          {subStep > 0 ? (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          ) : <span className="hidden md:block md:w-64" />}
          <button type="button" onClick={async () => {
            const missing = gateCheck(subStep);
            if (missing.length > 0) { setNextError(missing.join(", ")); return; }
            await flushSave();
            setNextError(null);
            setSubStep(subStep + 1); scrollToStep();
          }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
      {subStep === 3 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            ย้อนกลับ
          </button>
          <button
            onClick={async () => {
              // Gate: every "before-install" row must be confirmed. Skip rows
              // whose net is 0 (deposit fully covers them — nothing to confirm).
              const unpaidBefore = persistedInstallments
                .map((r, i) => ({ r, i }))
                .filter(({ r }) => r.when === "before")
                .filter(({ i }) => rowNet(i) > 0)
                .filter(({ i }) => !paidIdxSet.has(i));
              if (unpaidBefore.length > 0) {
                setNextError(`ต้องยืนยันการรับชำระงวดก่อนติดตั้งครบก่อน (เหลือ ${unpaidBefore.length} งวด)`);
                return;
              }
              setSaving(true);
              try {
                await apiFetch(`/api/leads/${lead.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    full_name: regName || undefined,
                    id_card_number: regIdCard || undefined,
                    id_card_address: regAddress || undefined,
                    installation_address: regInstallAddr || undefined,
                    status: "install",
                  }),
                });
                await refresh();
              } finally { setSaving(false); }
            }}
            disabled={saving}
            className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกและไปขั้นตอนติดตั้ง"}
          </button>
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      {followupRow !== null && (
        <AddActivityModal
          activityType="follow_up"
          leadId={lead.id}
          loanInstallmentIndex={followupRow}
          onClose={() => setFollowupRow(null)}
          onSaved={() => { refresh(); loadActivities(); }}
        />
      )}
    </StepLayout>
  );
}
