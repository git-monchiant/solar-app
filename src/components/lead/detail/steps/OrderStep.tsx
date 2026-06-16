"use client";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, LineIcon } from "@/components/ui/icons";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import AddActivityModal from "@/components/lead/detail/AddActivityModal";
import PaymentSection from "@/components/payment/PaymentSection";
import { buildPaymentFlex } from "@/lib/utils/line-flex";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import ErrorPopup from "@/components/ui/ErrorPopup";
import CustomerInfoForm from "@/components/customer/CustomerInfoForm";
import PaymentSlipsThumbs from "@/components/payment/PaymentSlipsThumbs";
import StepLayout from "../StepLayout";
import InstallmentReceiptList from "../InstallmentReceiptList";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { formatTHB as fmt, formatThaiDate as formatDate } from "@/lib/utils/formatters";
import { parseQuotationFiles } from "@/lib/utils/quotation";
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import DoneSection from "./DoneSection";

type PayMethod = "transfer" | "loan" | "cc";
type LoanBank = "ghb" | "gsb";

const LOAN_BANKS: { value: LoanBank; label: string }[] = [
  { value: "ghb", label: "ธอส. (อาคารสงเคราะห์)" },
  { value: "gsb", label: "ออมสิน" },
];

const CC_RATES = [0, 1.5, 2, 2.5, 3] as const;
const CC_DEFAULT = 3;

type Installment = {
  pct: number;
  when: "before" | "after";
  due_date: string | null;
  method: PayMethod;
  loan_bank: LoanBank | null;
  cc_pct: number | null;
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
          method: r?.method === "loan" ? "loan" : r?.method === "cc" ? "cc" : "transfer",
          loan_bank: r?.loan_bank === "ghb" || r?.loan_bank === "gsb" ? r.loan_bank : null,
          // `??` so a saved 0 ("no surcharge") survives a refresh — `||` would
          // treat 0 as falsy and snap the value back to CC_DEFAULT.
          cc_pct: r?.method === "cc" ? (r?.cc_pct != null && !isNaN(Number(r.cc_pct)) ? Number(r.cc_pct) : CC_DEFAULT) : null,
        }));
      }
    } catch { /* fall through */ }
  }
  // Backward-compat: derive from order_pct_before — single row "before" if 100,
  // otherwise งวด 1 = pctBefore (before), งวด 2 = remainder (after).
  const today = todayISO();
  const base = { method: "transfer" as const, loan_bank: null, cc_pct: null };
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
  const fileViewer = useFileViewer();
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

  // Quotation options (JSON in lead.quotation_files, or legacy CSV). The
  // customer picks one in substep 0 — that index lands in
  // quotation_accepted_idx, and quotation_amount + quotation_doc_no get
  // synced from the chosen entry. Single-quotation leads auto-accept idx 0.
  const quoteOptions = parseQuotationFiles(lead.quotation_files, lead.quotation_doc_no || "", lead.quotation_amount || 0);
  const [pickingQuote, setPickingQuote] = useState(false);
  const acceptedIdx = lead.quotation_accepted_idx;
  // Default-select idx 0 when nothing's been picked yet. User can still
  // switch on substep 0; this just avoids the empty-state where Next is
  // gated while the user is reading the customer's options.
  useEffect(() => {
    if (quoteOptions.length > 0 && (acceptedIdx === null || acceptedIdx === undefined) && !pickingQuote) {
      const first = quoteOptions[0];
      setPickingQuote(true);
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation_accepted_idx: 0,
          quotation_amount: first.amount,
          quotation_doc_no: first.doc_no || null,
        }),
      }).then(() => refresh()).finally(() => setPickingQuote(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteOptions.length, acceptedIdx]);

  // Once any installment payment is confirmed by accounting, the accepted
  // quotation is locked — switching the quote would re-base order_total and
  // every downstream amount derived from it, but recorded payments in the
  // payments table reflect the old quote. Mixing the two leaves the lead in
  // an inconsistent state, so block changes entirely past first payment.
  const quoteLocked = (lead.order_paid_count ?? 0) > 0;
  const pickQuote = async (idx: number) => {
    if (pickingQuote) return;
    if (quoteLocked) return;
    const opt = quoteOptions[idx];
    if (!opt) return;
    // Clicking the already-accepted quote is a no-op — avoids a needless
    // PATCH round-trip when nothing would change.
    if (idx === acceptedIdx) return;
    // Recompute the derived order fields so the DB matches the new quote
    // before any downstream substep submits. Discount: keep the percentage
    // when one is set (amount scales with total); a flat ฿ discount entered
    // without a pct is preserved as-is — the user explicitly chose an
    // absolute figure that survives quote changes. Per-installment amounts
    // are NOT stored — they're derived from (total − discount) × pct at
    // render time, so changing order_total alone repoints every installment.
    const pct = lead.order_discount_pct ?? 0;
    const newDiscountAmount = pct > 0
      ? Math.round(opt.amount * pct / 100)
      : (lead.order_discount_amount ?? 0);
    setPickingQuote(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation_accepted_idx: idx,
          quotation_amount: opt.amount,
          quotation_doc_no: opt.doc_no || null,
          order_total: opt.amount,
          order_discount_amount: newDiscountAmount || null,
        }),
      });
      setTotal(opt.amount);
      setDiscountAmount(newDiscountAmount);
      await refresh();
    } finally {
      setPickingQuote(false);
    }
  };
  const [discountPct, setDiscountPct] = useState<number>(lead.order_discount_pct ?? 0);
  const [discountAmount, setDiscountAmount] = useState<number>(lead.order_discount_amount ?? 0);
  const [discountNote, setDiscountNote] = useState<string>(lead.order_discount_note ?? "");

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
            pct: 0, when: "before" as const, due_date: today, method: "transfer" as const, loan_bank: null, cc_pct: null,
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
      setNextError(`ปรับจำนวนงวดไม่ได้: ${list} ชำระแล้ว — เปลี่ยนเป็น ${n} งวดจะกระทบ % ของงวดที่ชำระแล้ว ต้องถอน confirm ก่อน`);
      return;
    }

    setInstallments(newInst);
  };
  const updateInstallment = (i: number, patch: Partial<Installment>) => {
    setInstallments(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  // Lead-level payment follow-up date (ติดตามให้ชำระก่อนติดตั้ง N วัน). Stored in
  // leads.payment_followup_date (single value, report-friendly) + mirrored to an
  // activity log + lead.next_follow_up so it surfaces in the Today follow-up queue.
  const FOLLOWUP_DAYS_BEFORE = 3;
  // Two-field model: `enabled` = checkbox intent (independent of date), `date` =
  // computed install−N (null until install date is known — no sentinel).
  const [paymentFollowupEnabled, setPaymentFollowupEnabled] = useState<boolean>(!!lead.payment_followup_enabled);
  const [paymentFollowupDate, setPaymentFollowupDate] = useState<string | null>(
    lead.payment_followup_date ? String(lead.payment_followup_date).slice(0, 10) : null
  );
  const computeFollowupDate = useCallback((isoInstall: string | null): string | null => {
    if (!isoInstall) return null;
    const d = new Date(isoInstall + "T12:00:00");
    d.setDate(d.getDate() - FOLLOWUP_DAYS_BEFORE);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const togglePaymentFollowup = async (checked: boolean, computed: string | null) => {
    const prevDate = paymentFollowupDate; // value before this toggle
    setPaymentFollowupEnabled(checked);
    const date = checked ? computed : null;
    setPaymentFollowupDate(date);
    try {
      const patch: Record<string, unknown> = { payment_followup_enabled: checked, payment_followup_date: date };
      // On uncheck, clear next_follow_up too — but only when it (a) still points
      // at this payment follow-up and (b) is still in the future (ยังไม่ถึงกำหนด).
      // A due/overdue reminder is left alone so an in-progress task isn't wiped.
      if (!checked && prevDate && lead.next_follow_up && String(lead.next_follow_up).slice(0, 10) === prevDate && prevDate > todayISO()) {
        patch.next_follow_up = null;
      }
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // Log a real follow-up reminder only when we have an actual install date.
      if (checked && computed) {
        await apiFetch(`/api/leads/${lead.id}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_type: "follow_up",
            note: `ติดตามให้ชำระเงินก่อนติดตั้ง ${FOLLOWUP_DAYS_BEFORE} วัน (ติดตั้ง ${formatDate(installDate)})`,
            follow_up_date: computed,
          }),
        });
      }
      refresh();
    } catch (e) { console.error("payment follow-up failed:", e); }
  };

  // Clear the payment follow-up entirely (used by the paid-all / skip-step
  // triggers). Also wipes the active next_follow_up when it still points at the
  // payment follow-up date (regardless of due/overdue — the chase is over).
  const clearPaymentFollowup = useCallback(async () => {
    if (!paymentFollowupEnabled && !paymentFollowupDate) return;
    const prevDate = paymentFollowupDate;
    setPaymentFollowupEnabled(false);
    setPaymentFollowupDate(null);
    try {
      const patch: Record<string, unknown> = { payment_followup_enabled: false, payment_followup_date: null };
      if (prevDate && lead.next_follow_up && String(lead.next_follow_up).slice(0, 10) === prevDate) {
        patch.next_follow_up = null;
      }
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      refresh();
    } catch (e) { console.error("clear payment follow-up failed:", e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentFollowupEnabled, paymentFollowupDate, lead.id, lead.next_follow_up]);

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

  // Track every installment idx that already has a payments row (pending OR
  // confirmed) so we don't re-seed placeholders for it on the next click.
  const [existingIdxSet, setExistingIdxSet] = useState<Set<number>>(new Set());
  // Track installments awaiting accountant step-2 verify — uploader has
  // submitted a slip (slip_files.submitted_at IS NOT NULL) but admin hasn't
  // confirmed yet. Drives the per-row "รอยืนยัน" button.
  const [pendingApprovalIdxSet, setPendingApprovalIdxSet] = useState<Set<number>>(new Set());
  const loadPayments = async () => {
    try {
      const [paysRes, slipsRes] = await Promise.all([
        apiFetch(`/api/payments?lead_id=${lead.id}`) as Promise<Array<{ id: number; slip_field: string; confirmed_at: string | null }>>,
        apiFetch(`/api/slips?lead_id=${lead.id}`) as Promise<{ slips: Array<{ id: number; slip_field?: string; submitted_at: string | null }> }>,
      ]);
      const paid = new Set<number>();
      const idMap = new Map<number, number>();
      const existing = new Set<number>();
      for (const p of paysRes) {
        if (!p.slip_field) continue;
        const m = /^order_installment_(\d+)$/.exec(p.slip_field);
        if (!m) continue;
        const idx = parseInt(m[1]);
        existing.add(idx);
        if (p.confirmed_at) {
          paid.add(idx);
          idMap.set(idx, p.id);
        }
      }
      const pendingApproval = new Set<number>();
      for (const s of slipsRes.slips || []) {
        if (!s.slip_field || !s.submitted_at) continue;
        const m = /^order_installment_(\d+)$/.exec(s.slip_field);
        if (!m) continue;
        pendingApproval.add(parseInt(m[1]));
      }
      setPaidIdxSet(paid);
      setPaidIdToId(idMap);
      setExistingIdxSet(existing);
      setPendingApprovalIdxSet(pendingApproval);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadPayments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);
  const isPaid = (idx: number) => paidIdxSet.has(idx);
  const [installDate, setInstallDate] = useState(lead.install_date ? String(lead.install_date).slice(0, 10) : "");
  const [installDateEnd, setInstallDateEnd] = useState(lead.install_date_end ? String(lead.install_date_end).slice(0, 10) : "");

  // Auto-recompute the payment follow-up date when the install date changes
  // while the checkbox is enabled — e.g. user ticked before picking a date,
  // then set it at the นัดติดตั้ง step. Saves + logs the activity at that moment.
  // (Placed after installDate is declared to avoid a TDZ reference.)
  useEffect(() => {
    if (!paymentFollowupEnabled) return;
    const next = computeFollowupDate(installDate || null);
    if (next && next !== paymentFollowupDate) {
      setPaymentFollowupDate(next);
      (async () => {
        try {
          await apiFetch(`/api/leads/${lead.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_followup_date: next }),
          });
          await apiFetch(`/api/leads/${lead.id}/activities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              activity_type: "follow_up",
              note: `ติดตามให้ชำระเงินก่อนติดตั้ง ${FOLLOWUP_DAYS_BEFORE} วัน (ติดตั้ง ${formatDate(installDate)})`,
              follow_up_date: next,
            }),
          });
          refresh();
        } catch (e) { console.error("recompute payment follow-up failed:", e); }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installDate, paymentFollowupEnabled]);

  // Clear payment follow-up when every installment is paid — no one left to chase.
  useEffect(() => {
    if (!paymentFollowupEnabled) return;
    const allPaid = installments.length > 0 && installments.every((_, idx) => paidIdxSet.has(idx));
    if (allPaid) clearPaymentFollowup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidIdxSet, installments.length, paymentFollowupEnabled]);

  // Clear payment follow-up when the Order step is done/skipped (status advanced
  // past order) — the chase no longer belongs to this step.
  useEffect(() => {
    if (state === "done" && paymentFollowupEnabled) clearPaymentFollowup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, paymentFollowupEnabled]);

  const [saving, setSaving] = useState(false);
  // Tracks the per-substep "next" button while flushSave is in flight, so we
  // can disable + relabel it to give the user feedback during the round-trip.
  const [advancing, setAdvancing] = useState(false);
  const [lineSending, setLineSending] = useState(false);
  // Initialize from the persisted "quotation_sent_date" set in QuoteStep submit
  // (and re-stamped on every re-send below). After refresh the button keeps its
  // ✓ state instead of looking like nothing happened.
  const [lineSent, setLineSent] = useState<boolean>(!!lead.quotation_sent_date);
  const [lineConfirm, setLineConfirm] = useState(false);
  const [regName, setRegName] = useState(lead.full_name || "");
  const [regEmail, setRegEmail] = useState(lead.email || "");
  const [regIdCard, setRegIdCard] = useState(lead.id_card_number || "");
  const [regAddress, setRegAddress] = useState(lead.id_card_address || "");
  const [regInstallAddr, setRegInstallAddr] = useState(lead.installation_address || "");
  const [financeBank] = useState(lead.finance_bank ?? "");
  const [financeMonths] = useState<string>(lead.finance_months != null ? String(lead.finance_months) : "");
  const [financeMonthly] = useState<string>(lead.finance_monthly != null ? String(lead.finance_monthly) : "");
  const [loanBank] = useState(lead.finance_loan_bank ?? "");
  const [loanAmount] = useState<string>(lead.finance_loan_amount != null ? String(lead.finance_loan_amount) : "");
  const [loanDocs] = useState(lead.finance_documents ?? "");

  const pctAfter = 100 - pctBefore;
  // Single-installment (pctBefore = 100): customer already paid the deposit
  // (pre_total_price) at pre-survey, so the remaining before-install payment
  // is total − deposit. For split installments (pctBefore < 100) the deposit
  // is deducted on the งวด 2/2 line in InstallStep — but if deposit > งวด 2,
  // the excess credit spills back to งวด 1 (otherwise the customer would be
  // charged for งวด 1 even though they're already paid up).
  const depositPaid = lead.pre_total_price || 0;

  // Discount + deposit are deducted up-front so installments split the actual
  // net cash to collect. No per-row deposit credit needed.
  const totalDiscount = Math.min(total, discountAmount || 0);
  const effTotal = Math.max(0, total - totalDiscount);
  const netTotal = Math.max(0, effTotal - depositPaid);

  const rowGross = (idx: number) => {
    const pct = idx === _autoIdx ? lastPct : (installments[idx]?.pct ?? 0);
    return netTotal > 0 ? Math.round((netTotal * pct) / 100) : 0;
  };
  const rowNet = (idx: number) => rowGross(idx);
  // If deposit > eff (rare — refund-due to customer), surface the excess.
  const refund = Math.max(0, depositPaid - effTotal);
  // Credit-card surcharge: each "cc" installment row adds rowGross × cc_pct/100
  // to what the customer actually pays. Summed across all rows for the summary.
  const ccSurcharge = installments.reduce((s, r, idx) => {
    if (r.method === "cc" && r.cc_pct) return s + Math.round((rowGross(idx) * r.cc_pct) / 100);
    return s;
  }, 0);
  const totalToCharge = netTotal + ccSurcharge;

  // Build the auto-save payload from current state. Used both by the debounce
  // autosave (below) and the synchronous flushSave called when the user clicks
  // "ถัดไป" — the latter guarantees the latest values land in DB before the
  // sub-step advances (otherwise a fast click within the 800ms debounce window
  // could lose the most recent change).
  const buildSavePayload = useCallback(() => ({
    order_total: total || null,
    order_discount_pct: discountPct || null,
    order_discount_amount: discountAmount || null,
    order_discount_note: discountNote || null,
    // pctBefore/pctAfter are int columns + API enforces b+a=100. Round to keep
    // decimal per-installment pct from breaking the invariant via float drift.
    order_pct_before: Math.round(pctBefore),
    order_pct_after: 100 - Math.round(pctBefore),
    order_installments: JSON.stringify(persistedInstallments),
    install_date: installDate || null,
    install_date_end: installDateEnd || null,
    finance_bank: financeBank || null,
    finance_months: financeMonths ? parseInt(financeMonths) : null,
    finance_monthly: financeMonthly ? parseFloat(financeMonthly) : null,
    finance_loan_bank: loanBank || null,
    finance_loan_amount: loanAmount ? parseFloat(loanAmount) : null,
    finance_documents: loanDocs || null,
  }), [total, discountPct, discountAmount, discountNote, pctBefore, pctAfter, persistedInstallments, installDate, installDateEnd, financeBank, financeMonths, financeMonthly, loanBank, loanAmount, loanDocs]);

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
  }, [total, discountPct, discountAmount, discountNote, pctBefore, installments, installDate, financeBank, financeMonths, financeMonthly, loanBank, loanAmount, loanDocs]);

  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const doneTotal = lead.order_total || 0;
  // Apply special discount (VIP / promo) before splitting into before/after
  // installments — installments are computed off the discounted price, same
  // as the edit view's `effTotal` / `netTotal`.
  const doneDiscount = Math.min(doneTotal, lead.order_discount_amount || 0);
  const doneEffTotal = Math.max(0, doneTotal - doneDiscount);
  const donePctBefore = lead.order_pct_before ?? 100;
  const donePctAfter = 100 - donePctBefore;
  const doneAmtBefore = donePctBefore >= 100
    ? doneEffTotal
    : Math.round(doneEffTotal * donePctBefore / 100);
  const doneAmtAfter = donePctAfter > 0 ? doneEffTotal - Math.round(doneEffTotal * donePctBefore / 100) : 0;
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
          {doneDiscount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">
                ส่วนลด{lead.order_discount_pct ? ` ${lead.order_discount_pct}%` : ""}
                {lead.order_discount_note ? ` · ${lead.order_discount_note}` : ""}
              </span>
              <span className="font-mono tabular-nums text-gray-400">-{fmt(doneDiscount)} บาท</span>
            </div>
          )}
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
        <DoneSection color="amber" title="กำหนดเข้าติดตั้ง">
          <div className="font-semibold text-gray-800">
            {formatDate(lead.install_date)}
            {lead.install_date_end && lead.install_date_end !== lead.install_date && (
              <span> – {formatDate(lead.install_date_end)}</span>
            )}
          </div>
        </DoneSection>
      )}

      {lead.order_before_slip && (
        <DoneSection color="violet" title={
          <span className="flex items-center justify-between gap-2">
            <span>สลิปก่อนติดตั้ง</span>
            <span className="text-sm font-bold font-mono tabular-nums text-gray-900 normal-case">{fmt(doneAmtBefore)} บาท</span>
          </span>
        }>
          <PaymentSlipsThumbs slipUrl={lead.order_before_slip} label="สลิปก่อนติดตั้ง" />
        </DoneSection>
      )}


      {(lead.full_name || lead.id_card_number || lead.id_card_address || lead.installation_address) && (
        <DoneSection color="gray" title="ข้อมูลขออนุญาตติดตั้ง">
          <div className="space-y-0.5">
            {lead.full_name && <div className="flex justify-between"><span className="text-gray-400">ชื่อ-นามสกุล</span><span className="text-gray-800 text-right">{lead.full_name}</span></div>}
            {lead.id_card_number && <div className="flex justify-between"><span className="text-gray-400">เลขบัตร ปชช.</span><span className="font-mono tabular-nums text-gray-800">{lead.id_card_number}</span></div>}
            {lead.id_card_address && <div className="flex flex-col"><span className="text-gray-400">ที่อยู่ตามบัตร</span><span className="text-gray-800">{lead.id_card_address}</span></div>}
            {lead.installation_address && <div className="flex flex-col"><span className="text-gray-400">ที่อยู่ติดตั้ง</span><span className="text-gray-800">{lead.installation_address}</span></div>}
          </div>
        </DoneSection>
      )}
    </>
  );

  const gateCheck = (from: number): string[] => {
    const missing: string[] = [];
    // Substep 0 → 1: must have picked which quotation the customer accepted.
    // Single-option leads auto-accept (effect above) so this only blocks when
    // there's actually a choice to make.
    if (from === 0 && quoteOptions.length > 1 && (acceptedIdx === null || acceptedIdx === undefined)) {
      missing.push("เลือกใบเสนอราคา");
    }
    if (from === 1 && (!total || total <= 0)) missing.push("ยอดรวม");
    if (from === 1 && depositPaid > 0 && total > 0 && total < depositPaid) {
      missing.push(`ยอดต้องไม่ต่ำกว่าค่าสำรวจ (฿${fmt(depositPaid)})`);
    }
    if (from === 1 && (pctBefore === null || pctBefore === undefined)) missing.push("% ชำระก่อนติดตั้ง");
    // Leaving "งวดชำระ" → "นัดหมาย" needs ≥1 before-install row confirmed
    // (deposit landed). The remaining before-install rows are re-validated
    // at the final "บันทึกและไปขั้นตอนติดตั้ง" close — so sales can schedule
    // the install appointment without waiting for every งวด to clear.
    if (from === 1) {
      const beforeRows = persistedInstallments
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.when === "before")
        .filter(({ i }) => rowNet(i) > 0);
      const paidBefore = beforeRows.filter(({ i }) => paidIdxSet.has(i));
      if (beforeRows.length > 0 && paidBefore.length === 0) {
        missing.push(`ต้องรับชำระอย่างน้อย 1 งวดก่อนติดตั้ง`);
      }
    }
    if (from === 2 && !installDate) missing.push("วันนัดติดตั้ง");
    return missing;
  };
  // After validation passes from the payment-plan substep (1 → next), pre-create
  // pending payments rows for every "after-install" installment that doesn't
  // already have one. The accountant report then sees the full installment plan
  // (not just งวด 1 the customer happens to have started). Idempotent — skips
  // any idx that already has a row, pending or confirmed.
  const seedAfterInstallments = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < persistedInstallments.length; i++) {
      const row = persistedInstallments[i];
      if (row.when !== "after") continue;
      if (existingIdxSet.has(i)) continue;
      const net = rowNet(i);
      if (net <= 0) continue;
      tasks.push(apiFetch(`/api/payments/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          step_no: 10 + i,
          slip_field: `order_installment_${i}`,
          amount: net,
          description: `งวดที่ ${i + 1}`,
          payment_method: row.method,
          discount_pct: discountPct || null,
          discount_amount: discountAmount || null,
          discount_note: discountNote || null,
          cc_surcharge_pct: row.method === "cc" ? row.cc_pct : null,
          cc_surcharge_amount: row.method === "cc" && row.cc_pct ? Math.round((net * row.cc_pct) / 100) : null,
        }),
      }));
    }
    if (tasks.length === 0) return;
    await Promise.all(tasks);
    await loadPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, persistedInstallments, existingIdxSet]);

  const handleSubStepChange = async (n: number) => {
    if (n > subStep) {
      const missing = gateCheck(subStep);
      if (missing.length > 0) { setNextError(missing.join(", ")); return; }
      setAdvancing(true);
      try {
        await flushSave();
        if (subStep === 1) await seedAfterInstallments();
      } finally { setAdvancing(false); }
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
        <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
          <span className="text-sm font-semibold text-gray-900 md:flex-1 md:truncate">{lead.install_date
            ? `กำหนดเข้าติดตั้ง ${formatDate(lead.install_date)}${lead.install_date_end && lead.install_date_end !== lead.install_date ? ` – ${formatDate(lead.install_date_end)}` : ""}`
            : "ยืนยันการชำระ"}</span>
          <div className="md:mr-4">
            <InstallmentReceiptList
              leadId={lead.id}
              preDocNo={lead.pre_doc_no}
              when="before"
              refresh={refresh}
              installments={persistedInstallments}
              compact
            />
          </div>
        </div>
      }
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
    >
      {/* Step 1: ชุดการชำระเงิน (ราคา + งวด) */}
      {subStep === 1 && (
        <div className="space-y-3">
          {/* Show only the accepted quotation (picked in substep 0). Other
              options live in the JSON but aren't relevant once the customer
              has chosen. */}
          {(() => {
            const accepted = acceptedIdx !== null && acceptedIdx !== undefined ? quoteOptions[acceptedIdx] : null;
            if (!accepted) return null;
            const fileName = accepted.url.split("/").pop() || "ไฟล์ใบเสนอราคา";
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(accepted.url);
            return (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                <div className="text-xs font-bold text-orange-600 uppercase mb-2">ใบเสนอราคาที่ลูกค้าเลือก{accepted.doc_no ? ` · ${accepted.doc_no}` : ""}</div>
                <a href={accepted.url} onClick={fileViewer.handler(accepted.url, `ใบเสนอราคา${accepted.doc_no ? ` ${accepted.doc_no}` : ""}`)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-orange-100 hover:bg-orange-50 transition-colors">
                  <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={isImage ? "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" : "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                  </svg>
                  <span className="text-sm text-orange-700 font-semibold truncate">{fileName}</span>
                </a>
                {lead.quotation_note && <div className="text-xs text-orange-600 mt-2">{lead.quotation_note}</div>}
              </div>
            );
          })()}

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
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-3">
              <div className="flex items-center gap-1.5">
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
                    {n} <span className="hidden sm:inline">งวด</span>
                  </button>
                ))}
              </div>
              <span className="text-sm text-gray-500 md:ml-auto md:text-right">
                ยอดรวมที่ต้องชำระ <span className="font-bold font-mono tabular-nums text-lg text-gray-900">{fmt(totalToCharge)}</span> บาท
              </span>
            </div>

            <div className="space-y-2">
              {installments.map((row, i) => {
                const isAutoRow = i === _autoIdx;
                const paid = isPaid(i);
                const rowAmount = rowGross(i);
                const rowNetAmount = rowNet(i);
                const loanCheckbox = (
                  <label className={`flex items-center gap-1.5 text-xs text-gray-600 shrink-0 ${paid ? "cursor-default opacity-60" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={row.method === "loan"}
                      disabled={paid}
                      onChange={(e) => updateInstallment(i, e.target.checked
                        ? { method: "loan", loan_bank: row.loan_bank || LOAN_BANKS[0].value, cc_pct: null }
                        : { method: "transfer", loan_bank: null, cc_pct: null })}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>สินเชื่อ</span>
                  </label>
                );
                const ccCheckbox = (
                  <label className={`flex items-center gap-1.5 text-xs text-gray-600 shrink-0 ${paid ? "cursor-default opacity-60" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={row.method === "cc"}
                      disabled={paid}
                      onChange={(e) => updateInstallment(i, e.target.checked
                        ? { method: "cc", cc_pct: row.cc_pct ?? CC_DEFAULT, loan_bank: null }
                        : { method: "transfer", cc_pct: null, loan_bank: null })}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>บัตรเครดิต</span>
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
                const ccPicker = row.method === "cc" ? (
                  <select
                    value={row.cc_pct ?? CC_DEFAULT}
                    disabled={paid}
                    onChange={e => updateInstallment(i, { cc_pct: parseFloat(e.target.value) })}
                    className={`w-full md:w-auto h-9 px-2 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary ${paid ? "opacity-60" : ""}`}
                  >
                    {CC_RATES.map(r => (
                      <option key={r} value={r}>{r === 0 ? "0%" : `+${r}%`}</option>
                    ))}
                  </select>
                ) : null;
                const paymentOpen = paymentRow === i;
                const noNet = rowNetAmount === 0 && total > 0;
                const pendingApproval = !paid && pendingApprovalIdxSet.has(i);
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
                          : pendingApproval
                            ? "bg-amber-50 text-amber-700 border-amber-300"
                            : paymentOpen
                              ? "bg-active text-white border-active"
                              : "border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5"
                    }`}
                  >
                    {noNet ? (
                      <>✓ ไม่มียอดต้องเก็บ</>
                    ) : paid ? (
                      <>ชำระแล้ว</>
                    ) : pendingApproval ? (
                      <>
                        <ClockIcon className="w-3.5 h-3.5" strokeWidth={2} />
                        รอยืนยัน
                      </>
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
                  <div key={i} className={`rounded-lg border p-2 transition-colors ${paid ? "bg-emerald-50 border-emerald-200" : paymentOpen ? "bg-active-light border-active border-2 shadow-md shadow-active/20" : "bg-white border-gray-200"} ${row.method === "cc" && row.cc_pct && rowGross(i) > 0 ? "pb-6" : ""}`}>
                    {/* Mobile: 12-col grid (existing) · Desktop: flex single line */}
                    <div className="grid grid-cols-12 gap-2 items-center md:flex md:flex-nowrap">
                      <div className="order-1 col-span-4 md:w-24 text-xs font-semibold text-gray-700 md:shrink-0 flex items-center gap-1">
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
                          <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={3} />
                        )}
                        <span className={paid ? "text-emerald-800" : ""}>{`งวดที่ ${i + 1}`}</span>
                        {row.method === "loan" && rowFollowups.length > 0 && (
                          <span className="text-xxs text-active font-mono tabular-nums">({rowFollowups.length})</span>
                        )}
                      </div>
                      <div className="order-2 col-span-3 md:w-20 md:order-2 relative md:shrink-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={(() => {
                            const p = isAutoRow ? lastPct : row.pct;
                            return Number.isInteger(p) ? p : Math.round(p * 100) / 100;
                          })()}
                          disabled={isAutoRow || paid}
                          onChange={e => {
                            const cleaned = e.target.value.replace(/[^\d.]/g, "");
                            const v = cleaned === "" ? 0 : Math.min(100, parseFloat(cleaned) || 0);
                            updateInstallment(i, { pct: v });
                          }}
                          className={`w-full h-9 pl-2 pr-7 rounded-md border text-sm font-mono tabular-nums focus:outline-none ${isAutoRow || paid ? "bg-gray-50 border-gray-200 text-gray-700" : "border-gray-200 focus:border-primary"}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                      </div>
                      {/* Amount cell: editable — typing here back-derives pct from effTotal. */}
                      <div className="order-3 col-span-5 md:order-3 flex items-center justify-end md:justify-start gap-2 md:shrink-0 md:-ml-1">
                        {row.method === "loan" && rowFollowups.length > 0 && (() => {
                          const next = rowFollowups.find(a => !!a.follow_up_date);
                          return next ? (
                            <span className="hidden md:inline text-xs text-gray-500 font-normal whitespace-nowrap">(กำหนดติดตาม {formatDate(next.follow_up_date)})</span>
                          ) : null;
                        })()}
                        <div className="w-full md:w-32 text-right relative">
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={netTotal > 0 ? rowAmount : ""}
                              disabled={isAutoRow || paid}
                              onChange={e => {
                                const digits = e.target.value.replace(/[^\d]/g, "");
                                const amt = digits === "" ? 0 : Math.min(netTotal, parseInt(digits));
                                // Full precision so amt → pct → rowGross round-trips exactly.
                                const pct = netTotal > 0 ? (amt / netTotal) * 100 : 0;
                                updateInstallment(i, { pct });
                              }}
                              placeholder={netTotal > 0 ? "" : "—"}
                              className={`w-full h-9 pl-2 pr-6 rounded-md border text-sm font-mono tabular-nums text-right focus:outline-none ${isAutoRow || paid ? "bg-gray-50 border-gray-200 text-gray-700" : "border-gray-200 focus:border-primary"}`}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">฿</span>
                          </div>
                          {row.method === "cc" && row.cc_pct && rowAmount > 0 && (() => {
                            const fee = Math.round((rowAmount * row.cc_pct) / 100);
                            return (
                              <span className="absolute top-full left-0 right-0 mt-0.5 text-xs text-gray-500 whitespace-nowrap text-right pointer-events-none">
                                +ค่าธรรมเนียม {row.cc_pct}% = {fmt(fee)} ฿ · รวม <span className="font-semibold text-gray-700">{fmt(rowAmount + fee)}</span> ฿
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      {/* "ชำระหลังติดตั้ง" — desktop column (after amount) */}
                      <div className="hidden md:block md:order-4 md:shrink-0">
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
                      {/* Desktop: cc/loan checkboxes + their pickers + buttons inline at end of row */}
                      <div className="hidden md:flex items-center gap-2 md:ml-auto md:order-last">
                        {ccCheckbox}
                        {ccPicker}
                        {loanCheckbox}
                        {bankPicker}
                        {recordPaymentBtn}
                      </div>
                    </div>
                    {/* Mobile redesign — clear sections, full-width actions.
                        (% input moved up into the same row as งวด + amount.) */}
                    <div className="mt-2 md:hidden space-y-2">
                      {/* Row: payment-method checkboxes + ชำระหลังติดตั้ง */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {ccCheckbox}
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
                      {row.method === "cc" && ccPicker && (
                        <div>{ccPicker}</div>
                      )}
                      {/* Action button: บันทึกรับชำระ / รอยืนยัน / ชำระแล้ว — full width */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPaymentRow(paymentOpen ? null : i); }}
                        className={`w-full h-10 rounded-md border text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                          paid
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : pendingApproval
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : paymentOpen
                                ? "bg-active text-white border-active"
                                : "border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5"
                        }`}
                      >
                        {paid ? (
                          <>ชำระแล้ว</>
                        ) : pendingApproval ? (
                          <>
                            <ClockIcon className="w-4 h-4" strokeWidth={2} />
                            รอยืนยัน
                          </>
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
                          paymentTitle={installments.length > 1
                            ? `งวดที่ ${i + 1} · ค่าระบบ Solar Rooftop (${isAutoRow ? lastPct : row.pct}%)`
                            : `ค่าระบบ Solar Rooftop`}
                          amountLabel={installments.length > 1 ? `งวดที่ ${i + 1}/${installments.length}` : ""}
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
                          paymentMethod={row.method}
                          discountPct={discountPct || null}
                          discountAmount={discountAmount || null}
                          discountNote={discountNote || null}
                          ccSurchargePct={row.method === "cc" ? row.cc_pct : null}
                          ccSurchargeAmount={row.method === "cc" && row.cc_pct ? Math.round((rowNetAmount * row.cc_pct) / 100) : null}
                        />
                      </div>
                    )}
                    {/* Follow-up history table — collapsed by default, toggled via chevron */}
                    {row.method === "loan" && rowFollowups.length > 0 && expanded && (
                      <>
                        <div className="mt-2 -mx-2 border-t border-gray-100 overflow-x-auto">
                          <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 uppercase tracking-wider text-xxs border-b border-gray-100">
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
            {/* การติดตามชำระเงิน — checkbox เดียวระดับ order. คำนวณวันจาก
                installDate − N วัน. ติ๊ก → เก็บ leads.payment_followup_date +
                สร้าง activity (follow_up) + set lead.next_follow_up. */}
            {(() => {
              // ติ๊กได้เมื่อยังมีงวดที่ยังไม่ชำระ ≥1 งวด (ไม่ต้องรอวันติดตั้ง).
              // ถ้ายังไม่มีวันติดตั้ง → ติ๊กได้ แต่ date เป็น null + แสดง
              // "ยังไม่ระบุวันติดตั้ง"; date จะถูกคำนวณอัตโนมัติเมื่อตั้งวันติดตั้ง.
              const hasUnpaid = installments.some((_, idx) => !paidIdxSet.has(idx));
              const followupComputed = computeFollowupDate(installDate || null);
              const hint = !hasUnpaid
                ? "ชำระครบทุกงวดแล้ว"
                : followupComputed
                  ? formatDate(followupComputed)
                  : "คำนวณอัตโนมัติเมื่อระบุวันติดตั้ง";
              return (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 mb-1.5">การติดตามชำระเงิน</div>
                  <label className={`inline-flex items-center gap-2 text-sm ${hasUnpaid ? "cursor-pointer text-gray-700" : "opacity-60 cursor-default text-gray-500"}`}>
                    <input
                      type="checkbox"
                      checked={paymentFollowupEnabled}
                      disabled={!hasUnpaid}
                      onChange={e => togglePaymentFollowup(e.target.checked, followupComputed)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>
                      ติดตามให้ชำระเงินก่อนติดตั้ง {FOLLOWUP_DAYS_BEFORE} วัน{" "}
                      <span className={paymentFollowupEnabled && followupComputed ? "font-semibold text-amber-700" : "text-gray-400"}>
                        ({hint})
                      </span>
                    </span>
                  </label>
                </div>
              );
            })()}
          </div>

          {/* Post-installments summary: full breakdown from ยอดรวม through
              ยอดชำระสุทธิ, then CC fees + grand total when applicable. */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดรวม</span>
              <span className="font-bold font-mono">{fmt(total)} บาท</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>
                ส่วนลด{discountPct > 0 ? ` ${discountPct}%` : ""}
                {discountNote ? ` · ${discountNote}` : ""}
              </span>
              <span>{totalDiscount > 0 ? `-${fmt(totalDiscount)}` : "0"} บาท</span>
            </div>
            {depositPaid > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(depositPaid)} บาท</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
              <span className="text-gray-600">ยอดชำระสุทธิ</span>
              <span className="font-bold font-mono text-gray-900">{fmt(netTotal)} บาท</span>
            </div>
            {ccSurcharge > 0 && (<>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ค่าธรรมเนียมบัตรเครดิต</span>
                <span>+{fmt(ccSurcharge)} บาท</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                <span className="text-gray-600">ยอดรวมที่ต้องชำระ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(totalToCharge)} บาท</span>
              </div>
            </>)}
            {refund > 0 && (
              <div className="flex justify-between text-sm font-semibold text-emerald-700 border-t border-emerald-200 pt-1">
                <span>คืนเงินลูกค้า</span>
                <span className="font-bold font-mono">{fmt(refund)} บาท</span>
              </div>
            )}
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
            <LineIcon className="w-5 h-5" />
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
                  // LINE button needs a single URI — use the accepted
                  // quotation if the customer picked one, otherwise fall
                  // back to the first option.
                  const linkOpt = (acceptedIdx !== null && acceptedIdx !== undefined ? quoteOptions[acceptedIdx] : null) || quoteOptions[0];
                  const linkUrl = linkOpt?.url || "";
                  const downloadUrl = linkUrl.startsWith("http") ? linkUrl : `${origin}${linkUrl}`;
                  const bankLabel: Record<string, string> = { ghb: "ธอส.", gsb: "ออมสิน" };
                  const fmtMethod = (r: typeof persistedInstallments[number]) => r.method === "loan"
                    ? `สินเชื่อ${r.loan_bank ? ` ${bankLabel[r.loan_bank] || r.loan_bank}` : ""}`
                    : r.method === "cc" ? "บัตรเครดิต" : "เงินโอน/QR";
                  const cleanPct = (p: number) => Math.abs(p - Math.round(p)) < 0.01;
                  const details: { label: string; value: string }[] = [];
                  details.push({ label: "ยอดรวม", value: `฿${fmt(total)}` });
                  if (totalDiscount > 0) {
                    const dLabel = `ส่วนลด${discountPct > 0 ? ` ${discountPct}%` : ""}${discountNote ? ` · ${discountNote}` : ""}`;
                    details.push({ label: dLabel, value: `-฿${fmt(totalDiscount)}` });
                  }
                  if (depositPaid > 0) {
                    details.push({ label: "หักค่าสำรวจ", value: `-฿${fmt(depositPaid)}` });
                  }
                  details.push({ label: "ยอดชำระสุทธิ", value: `฿${fmt(netTotal)}` });
                  if (ccSurcharge > 0) {
                    details.push({ label: "ค่าธรรมเนียมบัตรเครดิต", value: `+฿${fmt(ccSurcharge)}` });
                    details.push({ label: "ยอดรวมที่ต้องชำระ", value: `฿${fmt(totalToCharge)}` });
                  }
                  if (persistedInstallments.length === 1) {
                    details.push({ label: "ชำระโดย", value: fmtMethod(persistedInstallments[0]) });
                  } else {
                    persistedInstallments.forEach((r, idx) => {
                      const gross = rowGross(idx);
                      const isCc = r.method === "cc" && r.cc_pct;
                      const ccFee = isCc ? Math.round((gross * (r.cc_pct as number)) / 100) : 0;
                      const totalRow = gross + ccFee;
                      const pctSuffix = cleanPct(r.pct) && r.pct > 0 ? ` (${Math.round(r.pct)}%)` : "";
                      const ccSuffix = isCc ? ` (+${r.cc_pct}%)` : "";
                      const paidSuffix = paidIdxSet.has(idx) ? " ✓ จ่ายแล้ว" : "";
                      details.push({
                        label: `งวดที่ ${idx + 1} · ${fmtMethod(r)}${ccSuffix}${paidSuffix}`,
                        value: `฿${fmt(totalRow)}${pctSuffix}`,
                      });
                    });
                  }
                  const messages = [buildPaymentFlex({
                    origin, title: "ใบเสนอราคา", amount: totalToCharge, name: lead.full_name,
                    actionLabel: "รายละเอียดใบเสนอราคา", actionUrl: downloadUrl, details,
                    note: "• กรุณาตรวจสอบเงื่อนไขการเสนอราคาให้ครบถ้วน\n• การชำระผ่านบัตรเครดิต จะมีค่าธรรมเนียม 3%",
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {zones.map(z => {
                const active = zone === z.name;
                // Selected: filled with the zone's colour. Unselected: white
                // pill with a small dot in the zone colour so the user can see
                // the legend without selecting first. Mirrors PreSurveyStep.
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => {
                      setZone(z.name);
                      apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: z.name }) }).catch(console.error);
                    }}
                    className="w-full h-10 rounded-lg text-sm font-semibold border transition-all text-left px-4 inline-flex items-center gap-2"
                    style={{
                      backgroundColor: active && z.color ? z.color : "white",
                      borderColor: z.color || "#e5e7eb",
                      color: active ? "white" : (z.color || "#4b5563"),
                    }}
                  >
                    {!active && z.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                    )}
                    {z.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">กำหนดเข้าติดตั้ง</label>
            <CalendarPicker
              date={installDate}
              dateEnd={installDateEnd}
              timeSlot=""
              onDateChange={setInstallDate}
              onDateEndChange={setInstallDateEnd}
              onTimeSlotChange={() => {}}
              showTimeSlot={false}
              showSurveySlots
              teamContext="install"
              excludeLeadId={lead.id}
              allowPast
            />
            <div className="text-xs text-gray-500 mt-2">
              {installDate
                ? installDateEnd
                  ? (() => {
                      const start = new Date(installDate + "T12:00:00");
                      const end = new Date(installDateEnd + "T12:00:00");
                      const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                      return `เลือกแล้ว: ${formatDate(installDate)} – ${formatDate(installDateEnd)} (ใช้เวลาติดตั้ง ${days} วัน)`;
                    })()
                  : "คลิกอีกครั้งบนวันที่ถัดไปเพื่อเลือกช่วง — หรือเว้นไว้ถ้าติดตั้งวันเดียว"
                : "คลิกวันเริ่มต้นการติดตั้ง"}
            </div>
          </div>
        </div>
      )}

      {/* Step 0: ส่งใบเสนอราคาให้ลูกค้า */}
      {subStep === 0 && (
        <div className="space-y-3">
          {quoteOptions.length > 0 && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="text-xs font-bold text-orange-600 uppercase">
                  {quoteOptions.length === 1 ? "ใบเสนอราคา" : `เลือกใบเสนอราคาที่ลูกค้ารับ (${quoteOptions.length} ชุด)`}
                </div>
                {quoteLocked && (
                  <div className="inline-flex items-center gap-1 text-xxs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full" title={`ชำระแล้ว ${lead.order_paid_count} งวด — เปลี่ยนใบเสนอราคาไม่ได้`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    <span>ล็อก · ชำระแล้ว {lead.order_paid_count} งวด</span>
                  </div>
                )}
              </div>
              <div className={`grid gap-2 ${quoteOptions.length > 1 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
                {quoteOptions.map((opt, i) => {
                  const fileName = opt.url.split("/").pop() || `ไฟล์ ${i + 1}`;
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(opt.url);
                  const isAccepted = acceptedIdx === i;
                  const isSelectable = quoteOptions.length > 1 && !quoteLocked;
                  return (
                    <div key={i}
                      onClick={isSelectable ? () => pickQuote(i) : undefined}
                      className={`rounded-lg border p-2 transition-colors ${isAccepted ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-300" : "border-orange-100 bg-white"} ${isSelectable && !isAccepted ? "cursor-pointer hover:border-orange-300 hover:bg-orange-50/40" : ""} ${pickingQuote ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">ชุด {i + 1}</div>
                        {isAccepted && <div className="text-xxs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">เลือกแล้ว</div>}
                      </div>
                      <a href={opt.url} onClick={fileViewer.handler(opt.url, `ใบเสนอราคา ชุด ${i + 1}`)} className="flex items-center gap-2 px-2 py-1.5 rounded bg-orange-50 border border-orange-100 hover:bg-orange-100 transition-colors">
                        <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={isImage ? "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" : "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                        </svg>
                        <span className="text-xs text-orange-700 font-semibold truncate">{fileName}</span>
                      </a>
                      <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-gray-900">{fmt(opt.amount)} บาท</div>
                      {opt.doc_no && <div className="text-xxs text-gray-500 font-mono mt-0.5">{opt.doc_no}</div>}
                    </div>
                  );
                })}
              </div>
              {lead.quotation_note && <div className="text-xs text-orange-600 mt-2">{lead.quotation_note}</div>}
            </div>
          )}

          <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-2">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">ส่วนลด</div>
            <div className="grid grid-cols-4 gap-2">
              <label className="col-span-2 min-w-0">
                <span className="text-xxs text-gray-500">Discount Text</span>
                <input
                  type="text" maxLength={200}
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  placeholder="เช่น โปรโมชัน, ส่วนลดพนักงาน"
                  className="mt-0.5 w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active"
                />
              </label>
              <label>
                <span className="text-xxs text-gray-500">%</span>
                <div className="relative mt-0.5">
                  <input
                    type="number" min={0} max={100} step="0.01"
                    value={discountPct || ""}
                    onChange={(e) => {
                      const pct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                      setDiscountPct(pct);
                      if (total > 0) setDiscountAmount(Math.round((total * pct) / 100));
                    }}
                    placeholder="0"
                    className="w-full h-10 pl-3 pr-7 rounded-lg border border-gray-200 text-sm font-mono tabular-nums text-right focus:outline-none focus:border-active"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                </div>
              </label>
              <label>
                <span className="text-xxs text-gray-500">บาท</span>
                <div className="relative mt-0.5">
                  <input
                    type="number" min={0} step="1"
                    value={discountAmount || ""}
                    onChange={(e) => {
                      const amt = Math.max(0, parseFloat(e.target.value) || 0);
                      setDiscountAmount(amt);
                      if (total > 0) setDiscountPct(Math.round((amt / total) * 10000) / 100);
                    }}
                    placeholder="0"
                    className="w-full h-10 pl-3 pr-7 rounded-lg border border-gray-200 text-sm font-mono tabular-nums text-right focus:outline-none focus:border-active"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">฿</span>
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดรวม</span>
              <span className="font-bold font-mono">{fmt(total)} บาท</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>
                ส่วนลด{discountPct > 0 ? ` ${discountPct}%` : ""}
                {discountNote ? ` · ${discountNote}` : ""}
              </span>
              <span>{totalDiscount > 0 ? `-${fmt(totalDiscount)}` : "0"} บาท</span>
            </div>
            {depositPaid > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(depositPaid)} บาท</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
              <span className="text-gray-600">ยอดชำระสุทธิ</span>
              <span className="font-bold font-mono text-gray-900">{fmt(netTotal)} บาท</span>
            </div>
            {ccSurcharge > 0 && (<>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ค่าธรรมเนียมบัตรเครดิต</span>
                <span>+{fmt(ccSurcharge)} บาท</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-600">ยอดรวมที่ต้องชำระ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(totalToCharge)} บาท</span>
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
              <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">อีเมล <span className="text-red-500">*</span></label>
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="example@mail.com" className="w-full h-11 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน</label>
              <input type="text" inputMode="numeric" maxLength={13} value={regIdCard} onChange={e => setRegIdCard(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก" className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน</label>
              <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">ที่อยู่ติดตั้ง</label>
                <label className="text-xs text-gray-600 inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary cursor-pointer"
                    checked={!!regAddress && regInstallAddr === regAddress}
                    onChange={(e) => { if (e.target.checked) setRegInstallAddr(regAddress); }}
                  />
                  เหมือนที่อยู่ตามบัตร
                </label>
              </div>
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
              <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
              ย้อนกลับ
            </button>
          ) : <span className="hidden md:block md:w-64" />}
          <button
            type="button"
            disabled={advancing}
            onClick={async () => {
              const missing = gateCheck(subStep);
              if (missing.length > 0) { setNextError(missing.join(", ")); return; }
              setAdvancing(true);
              try {
                await flushSave();
                if (subStep === 1) await seedAfterInstallments();
              } finally { setAdvancing(false); }
              setNextError(null);
              setSubStep(subStep + 1); scrollToStep();
            }}
            className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
          >
            {advancing ? "กำลังบันทึก..." : "ถัดไป"}
            {!advancing && (
              <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
            )}
          </button>
        </div>
      )}
      {subStep === 3 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
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
                    email: regEmail || null,
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
          leadPhone={lead.phone}
          loanInstallmentIndex={followupRow}
          onClose={() => setFollowupRow(null)}
          onSaved={() => { refresh(); loadActivities(); }}
        />
      )}
    </StepLayout>
  );
}
