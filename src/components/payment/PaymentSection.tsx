"use client";
import { CheckIcon, DownloadIcon, PlusIcon } from "@/components/ui/icons";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import ImageLightbox from "@/components/ui/ImageLightbox";
import PaymentHeader from "./PaymentHeader";
import { buildPaymentFlex } from "@/lib/utils/line-flex";
import { compressSlipFile } from "@/lib/utils/compress-slip";
import { formatTHB } from "@/lib/utils/formatters";
import { useActiveRoles } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";
import ActualReceiptUpload from "@/components/lead/detail/ActualReceiptUpload";

const MAX_SLIPS = 5;

interface Props {
  paymentTitle: string;
  amountLabel: string;
  amount: number;
  /** Optional — when provided, PaymentHeader shows a pencil icon to edit the amount inline. */
  onAmountEdit?: (next: number) => void;
  leadId: number;
  leadName: string;
  lineId: string | null;
  slipUrl: string | null;
  slipField: string;
  paymentNote?: string;
  details?: { label: string; value: string }[];
  onVerified?: (url: string) => void;
  /** Renders a "ยืนยันรับชำระเงิน" button below the slip upload area. When clicked,
   * POSTs to /api/payments to write the transaction row (with all staged slips bundled
   * into slip_data/slip_data_2..5) and switch the lead's slip URL to point at the new
   * /api/payments/:id. Parent's onConfirmed is called after for refresh. */
  stepNo?: number;
  description?: string;
  docNo?: string | null;
  /** If true, the confirm button shows a "ยืนยันแล้ว" state and is disabled. */
  confirmed?: boolean;
  onConfirmed?: () => Promise<unknown> | void;
  /** Fires after a successful undo (rollback). Separate from onConfirmed so parents
   * can refresh without advancing sub-step. */
  onUndone?: () => Promise<unknown> | void;
  confirmLabel?: string;
  // Optional public-facing document URL (receipt PDF). If set, LINE flex button links to it
  // instead of the default /pay/<token> payment page.
  docUrl?: string;
  /** Hide the PaymentHeader (title + amount line). Use when the parent already shows
   * those details and PaymentSection is embedded as a slot. */
  hideHeader?: boolean;
  /** Force the section to only expose the "อื่นๆ" tab — used by loan installments
   * where customers pay via the bank, not via our QR/link/transfer flows. */
  onlyOther?: boolean;
  /** Show a dedicated cheque tab. The cheque is recorded as received first;
   * Accounting confirms actual money in a separate action after it clears. */
  allowCheque?: boolean;
  /** Per-payment context stamped onto the payments row at intent time so receipts
   * and reports don't have to re-derive from the lead. All optional. */
  paymentMethod?: string | null;
  discountPct?: number | null;
  discountAmount?: number | null;
  discountNote?: string | null;
  ccSurchargePct?: number | null;
  ccSurchargeAmount?: number | null;
  /** Current saved pre-survey fee type. Passing this prop (with onFeeTypeChange)
   * surfaces the "ฟรีค่าสำรวจ" checkbox under the amount header. Pre-survey
   * step is the only caller; other payment screens leave both unset. */
  feeType?: "free" | "normal";
  /** Called when the user toggles the checkbox. Parent should PATCH the lead
   * (pre_survey_fee_type + pre_total_price: 0|default + payment_confirmed flag)
   * then refresh so the new feeType prop flows back in. */
  onFeeTypeChange?: (type: "free" | "normal") => Promise<unknown> | void;
  /** Reports whether the อื่นๆ-tab textarea is missing required input — true
   * when on tab='other', not waived, and the textarea is empty. Parent's
   * "ถัดไป" validator merges this with its own slip check so both errors show. */
  onOtherTabInputMissing?: (missing: boolean) => void;
  /** Seed value for the อื่นๆ-tab textarea (otherMethod). Used to restore the
   * remark after a refresh; the parent reads it from lead.pre_note. Only
   * applies before the payment is confirmed — confirmed reads from
   * payment.description as before. */
  initialOtherMethod?: string;
  /** Fires on every textarea edit. Parent typically debounces this into a
   * lead.pre_note PATCH so the remark survives refresh/navigation. */
  onOtherMethodChange?: (value: string) => void;
}

type Settings = {
  promptpay_qr_enabled?: string;
  promptpay_link_enabled?: string;
  promptpay_tax_id?: string;
  promptpay_biller_id?: string;
  company_name?: string;
  company_short_name?: string;
  bank_account_enabled?: string;
  bank_account_bank?: string;
  bank_account_branch?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  other_payment_enabled?: string;
};

type SlipStatus = "verifying" | "verified" | "failed";
type DocType = "slip" | "cheque" | "paper" | "other";
interface SlipEntry {
  key: string;            // stable React key (slip_files id, payment slot, or tmp-<ts>)
  url: string;            // image URL (or data: for local preview)
  status: SlipStatus;
  error?: string;
  slipFilesId?: number;   // staging row id — needed for DELETE /api/slips/:id
  tempFileUrl?: string;   // /api/files/<name> during verify; cleaned after success/fail
  filename?: string;
  // null = draft (uploader still working); non-null = submitted to accountant.
  submittedAt?: string | null;
  // Fields parsed from the file by Gemini at verify time. Displayed under
  // the thumbnail so admin can match against the visible doc without opening.
  extracted?: {
    doc_type?: DocType | null;
    amount?: number | null;
    ref1?: string | null;
    ref2?: string | null;
    trans_id?: string | null;
    datetime?: string | null;
    cheque_no?: string | null;
  };
}

export default function PaymentSection({
  paymentTitle,
  amountLabel,
  onAmountEdit,
  amount,
  leadId,
  leadName,
  lineId,
  slipUrl,
  slipField,
  paymentNote,
  details,
  onVerified,
  stepNo,
  description,
  docNo,
  confirmed,
  onConfirmed,
  onUndone,
  confirmLabel,
  docUrl,
  hideHeader,
  onlyOther,
  allowCheque,
  paymentMethod,
  discountPct,
  discountAmount,
  discountNote,
  ccSurchargePct,
  ccSurchargeAmount,
  feeType,
  onFeeTypeChange,
  onOtherTabInputMissing,
  initialOtherMethod,
  onOtherMethodChange,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Fire-and-forget audit log — never blocks user flow.
  const log = (action: string, details?: Record<string, unknown>) => {
    apiFetch("/api/payment-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, slip_field: slipField, step_no: stepNo, action, details }),
    }).catch(() => {});
  };

  const [settings, setSettings] = useState<Settings>({});
  // Remember the last tab the user picked for this (lead, slip_field) pair so
  // a refresh after submitting a slip on "bank" doesn't snap back to "qr".
  // Confirmed payments override this via payment_method below.
  const tabStorageKey = `paymentTab:${leadId}:${slipField}`;
  type PaymentTab = "qr" | "link" | "bank" | "cheque" | "other";
  const [tab, setTab] = useState<PaymentTab>(() => {
    if (typeof window === "undefined") return "qr";
    const saved = localStorage.getItem(tabStorageKey);
    if (saved === "cheque" && allowCheque) return saved;
    if (saved === "qr" || saved === "link" || saved === "bank" || saved === "other") return saved;
    return "qr";
  });
  const effectivePaymentMethod = tab === "cheque"
    ? "cheque"
    : paymentMethod ?? (tab === "bank" ? "bank_transfer" : tab);
  const chequePayment = effectivePaymentMethod === "cheque";
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(tabStorageKey, tab);
  }, [tab, tabStorageKey]);
  useEffect(() => {
    if (confirmed) return;
    if (paymentMethod === "cheque" && allowCheque) setTab("cheque");
    else if (paymentMethod === "bank_transfer" || paymentMethod === "transfer") setTab("bank");
    else if (paymentMethod === "qr" || paymentMethod === "link" || paymentMethod === "other") setTab(paymentMethod);
  }, [paymentMethod, allowCheque, confirmed]);
  const [otherMethod, setOtherMethod] = useState(initialOtherMethod ?? "");
  // Re-seed when the parent's value changes (e.g. lead refresh after PATCH).
  // Only applies pre-confirmation; once confirmed, payment.description owns it.
  useEffect(() => {
    if (!confirmed && initialOtherMethod !== undefined) setOtherMethod(initialOtherMethod);
  }, [initialOtherMethod, confirmed]);
  // ประเภทค่าสำรวจ — local radio state mirrors the saved feeType so UI flips
  // (amount → 0, hide invoice) the moment the user picks "free", before save.
  // `effectiveWaived` is what the UI actually reads.
  const waiverEnabled = !!onFeeTypeChange;
  const [localFeeType, setLocalFeeType] = useState<"free" | "normal">(feeType ?? "normal");
  const effectiveWaived = waiverEnabled && localFeeType === "free";
  useEffect(() => { setLocalFeeType(feeType ?? "normal"); }, [feeType]);
  // Inline amount editor for the radio-row-1 "ค่าสำรวจ X บาท ✎" case. We can't
  // nest PaymentHeader inside a <label> (any child click would toggle the radio
  // too) so we mirror its edit affordance locally and stopPropagation on the
  // pencil so editing doesn't flip the selection back to 'normal'.
  const [amountEditing, setAmountEditing] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const commitAmount = () => {
    const n = Math.max(0, parseInt(amountDraft) || 0);
    onAmountEdit?.(n);
    setAmountEditing(false);
  };
  const { activeRoles } = useActiveRoles();
  const dialog = useDialog();
  // Gate by the *active* role view, not the user's available roles — when an
  // admin switches to seeker mode, payment confirm/rollback should disappear.
  const isAdmin = activeRoles.includes("admin");
  // Step-1 (uploader) — admin/sales/solar can submit slips for review.
  const canStep1 = activeRoles.some(r => r === "admin" || r === "sales" || r === "solar" || r === "smartify");
  // Step-2 (accountant) — only account/admin can confirm receipt of money.
  const canStep2 = activeRoles.some(r => r === "admin" || r === "account");

  const [slips, setSlips] = useState<SlipEntry[]>([]);
  const [slipsLoaded, setSlipsLoaded] = useState(false);
  const [confirmedMethod, setConfirmedMethod] = useState<string | null>(null);
  const [actualReceiptUrl, setActualReceiptUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; index: number } | null>(null);
  const verifiedFiredRef = useRef(false);

  // Initial load of current slips. When confirmed, read confirmed slot list from the
  // payment record. Otherwise read the staging list from slip_files. A 404 on the
  // payment list (e.g. user just hit ถอย, parent hasn't refreshed slipUrl yet) is
  // expected — clear local state and let the next render with fresh props re-load.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (confirmed && slipUrl?.startsWith("/api/payments/")) {
          const payId = slipUrl.split("/").pop();
          const res = await fetch(`/api/payments/${payId}?list=1`, {
            headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
          });
          if (cancelled) return;
          if (res.status === 404) {
            setSlips([]);
            return;
          }
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const data = await res.json() as { slots: Array<{ slot: number; url: string; filename: string | null }>; payment_method: string | null; description: string | null; actual_receipt_url: string | null };
          if (cancelled) return;
          let loadedSlips: SlipEntry[] = data.slots.map((s) => ({
            key: `slot-${s.slot}`,
            url: s.url,
            status: "verified" as const,
            filename: s.filename ?? undefined,
          }));
          // Receiving a cheque from the Accounting pending queue records
          // cheque_received_at by PATCH but intentionally leaves submitted
          // evidence in slip_files until actual money clears. Fall back to
          // staging here so Step 05 still shows the cheque image.
          if (data.payment_method === "cheque" && loadedSlips.length === 0) {
            const staged = await apiFetch(`/api/slips?lead_id=${leadId}&slip_field=${encodeURIComponent(slipField)}`) as { slips: Array<{ id: number; url: string; filename: string | null; submitted_at: string | null }> };
            if (cancelled) return;
            loadedSlips = staged.slips.map((s) => ({
              key: `slip-${s.id}`,
              url: s.url,
              status: "verified" as const,
              slipFilesId: s.id,
              filename: s.filename ?? undefined,
              submittedAt: s.submitted_at ?? null,
            }));
          }
          setSlips(loadedSlips);
          setConfirmedMethod(data.payment_method);
          setActualReceiptUrl(data.actual_receipt_url || null);
          // Extract "ชำระโดย: …" note from the stored description so the textarea
          // re-populates after refresh (otherMethod state is component-local).
          if (data.description) {
            const m = data.description.match(/ชำระโดย:\s*([\s\S]+)$/);
            if (m) setOtherMethod(m[1].trim());
          }
          // Snap active tab to the confirmed method so user sees ✓ on the right one.
          if (data.payment_method === "bank_transfer") setTab("bank");
          else if (data.payment_method === "cheque") setTab("cheque");
          else if (data.payment_method === "qr" || data.payment_method === "link" || data.payment_method === "other") setTab(data.payment_method);
        } else {
          const res = await apiFetch(`/api/slips?lead_id=${leadId}&slip_field=${encodeURIComponent(slipField)}`) as { slips: Array<{ id: number; url: string; filename: string | null; submitted_at: string | null }> };
          if (cancelled) return;
          const list = res.slips.map((s) => ({
            key: `slip-${s.id}`,
            url: s.url,
            status: "verified" as const,
            slipFilesId: s.id,
            filename: s.filename ?? undefined,
            submittedAt: s.submitted_at ?? null,
          }));
          setSlips(list);
          if (list.length > 0 && !verifiedFiredRef.current) {
            verifiedFiredRef.current = true;
            onVerified?.(list[0].url);
          }
          // The uploader's loan/other-payment detail is persisted on the
          // pending payment row at step 1. Reload it here so Accounting sees
          // the same detail from another session/device before confirming.
          if (stepNo !== undefined) {
            const payments = await apiFetch(`/api/payments?lead_id=${leadId}&step_no=${stepNo}`) as Array<{ slip_field: string; description: string | null }>;
            if (cancelled) return;
            const pendingDescription = payments.find((p) => p.slip_field === slipField)?.description;
            const detailMatch = pendingDescription?.match(/ชำระโดย:\s*([\s\S]+)$/);
            if (detailMatch) setOtherMethod(detailMatch[1].trim());
          }
        }
      } catch (e) {
        console.error("load slips failed:", e);
      } finally {
        if (!cancelled) setSlipsLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [leadId, slipField, confirmed, slipUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accountant rejection banner state. Lives on lead.payment_reject_notes
  // (JSON keyed by slip_field). Refreshed on mount, after rejection, and
  // after submitDrafts (server clears the note when uploader resubmits).
  type RejectNote = { reason: string; by: string; at: string };
  const [rejectNote, setRejectNote] = useState<RejectNote | null>(null);
  const loadRejectNote = useCallback(async () => {
    try {
      const lead = await apiFetch(`/api/leads/${leadId}`) as { payment_reject_notes?: string | null };
      const raw = lead?.payment_reject_notes;
      if (!raw) { setRejectNote(null); return; }
      const parsed = JSON.parse(raw);
      const entry = parsed && typeof parsed === "object" ? parsed[slipField] : null;
      setRejectNote(entry ?? null);
    } catch { /* ignore — banner just won't show */ }
  }, [leadId, slipField]);
  useEffect(() => { loadRejectNote(); }, [loadRejectNote]);

  // Reject modal (accountant action — reason required, hard delete of all
  // submitted slips for this slip_field, banner appears for uploader).
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!reason || rejecting) return;
    setRejecting(true);
    try {
      await apiFetch("/api/payments/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, slip_field: slipField, reason }),
      });
      setRejectOpen(false);
      setRejectReason("");
      // Clear local slip state — server deleted the staging rows.
      setSlips(prev => prev.filter(s => !s.slipFilesId));
      await loadRejectNote();
      await onUndone?.();
    } catch (e) {
      dialog.alert({
        title: "ปฏิเสธไม่สำเร็จ",
        message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "danger",
      });
    } finally {
      setRejecting(false);
    }
  };

  const [undoing, setUndoing] = useState(false);
  const handleUndo = async () => {
    const ok = await dialog.confirm({
      title: "ถอย payment",
      message: "ยืนยันการถอย payment นี้?\nจะลบ slip + ปลดสถานะ + ต้อง upload สลิปใหม่",
      variant: "danger",
      confirmText: "ถอย payment",
    });
    if (!ok) return;
    if (!slipUrl?.startsWith("/api/payments/")) return;
    const payId = slipUrl.split("/").pop();
    setUndoing(true);
    try {
      await apiFetch(`/api/payments/${payId}`, { method: "DELETE" });
      await onUndone?.();
    } catch (e) {
      dialog.alert({
        title: "ถอยไม่สำเร็จ",
        message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "danger",
      });
    } finally { setUndoing(false); }
  };
  const [bankCopied, setBankCopied] = useState<"number" | "name" | "all" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState<"credit_transfer" | "bill_payment">("credit_transfer");
  const [qrRef1, setQrRef1] = useState<string | null>(null);
  const [qrRef2, setQrRef2] = useState<string | null>(null);
  const [refCopied, setRefCopied] = useState<"ref1" | "ref2" | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string>("");
  // Per-payment number (Ref2 in the QR). Allocated by /api/payments/intent so
  // every QR carries a unique transaction reference. Empty until allocated;
  // QR will fall back to the static settings ref2 in that brief window.
  const [paymentNo, setPaymentNo] = useState<string>("");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [lineSending, setLineSending] = useState<string | null>(null);
  const [lineSent, setLineSent] = useState<string | null>(null);
  const [lineConfirmType, setLineConfirmType] = useState<"qr" | "link" | "bank" | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      if (onlyOther) { setTab("other"); return; }
      const qr = s.promptpay_qr_enabled !== "false";
      const link = s.promptpay_link_enabled !== "false";
      const bank = s.bank_account_enabled !== "false";
      const other = s.other_payment_enabled === "true";
      if (!qr && link) setTab("link");
      else if (!qr && !link && bank) setTab("bank");
      else if (!qr && !link && !bank && other) setTab("other");
    }).catch(console.error);
  }, [onlyOther]);
  // Free → switch to "other" tab. Independent from the settings-driven default
  // above so toggling the radio at runtime moves the user to the right place.
  useEffect(() => {
    if (effectiveWaived) setTab("other");
  }, [effectiveWaived]);
  // Surface "อื่นๆ tab needs a รายละเอียด" requirement up to the parent so its
  // "ถัดไป" validator can list it. Textarea is required for BOTH normal and
  // free (free needs a reason; normal needs a payment-method note).
  useEffect(() => {
    onOtherTabInputMissing?.(tab === "other" && otherMethod.trim() === "" && !confirmed);
  }, [tab, otherMethod, confirmed, onOtherTabInputMissing]);

  // Allocate a payment_no (Ref2) up-front so the QR carries a stable per-payment
  // reference. Skipped if confirmed (payment row already exists; pending lookup
  // would also collide). Idempotent — same (lead, step, slip_field) returns the
  // same number, even if amount changes.
  useEffect(() => {
    if (amount <= 0 || !leadId || stepNo === undefined || !slipField) return;
    if (confirmed) return;
    let cancelled = false;
    apiFetch("/api/payments/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId, step_no: stepNo, slip_field: slipField, amount, description,
        payment_method: effectivePaymentMethod,
        discount_pct: discountPct ?? null,
        discount_amount: discountAmount ?? null,
        discount_note: discountNote ?? null,
        cc_surcharge_pct: ccSurchargePct ?? null,
        cc_surcharge_amount: ccSurchargeAmount ?? null,
      }),
    }).then((r: { payment_no: string; id: number }) => {
      if (!cancelled) {
        if (r.payment_no) setPaymentNo(r.payment_no);
        if (r.id) setPaymentId(r.id);
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [leadId, stepNo, slipField, amount, description, confirmed, effectivePaymentMethod, discountPct, discountAmount, discountNote, ccSurchargePct, ccSurchargeAmount]);

  // QR amount must match the document — include CC surcharge when present.
  const qrAmount = amount + (ccSurchargeAmount ?? 0);

  // Generate PromptPay QR — regen whenever amount or payment_no changes
  useEffect(() => {
    if (qrAmount <= 0) return;
    setQrLoading(true);
    setQrError(null);
    const params = new URLSearchParams({ amount: String(qrAmount) });
    if (leadId) params.set("lead_id", String(leadId));
    if (stepNo) params.set("step_no", String(stepNo));
    if (paymentNo) params.set("ref2", paymentNo);
    apiFetch(`/api/qr?${params.toString()}`)
      .then((d: { qrDataUrl: string; mode?: "credit_transfer" | "bill_payment"; ref1?: string | null; ref2?: string | null }) => {
        setQrDataUrl(d.qrDataUrl);
        if (d.mode) setQrMode(d.mode);
        setQrRef1(d.ref1 ?? null);
        setQrRef2(d.ref2 ?? null);
      })
      .catch((err) => { console.error(err); setQrError("สร้าง QR ไม่สำเร็จ"); })
      .finally(() => setQrLoading(false));
  }, [qrAmount, leadId, stepNo, paymentNo]);

  // Ensure a pay token exists for (lead_id, amount, description, installment) so URLs can hide the amount
  useEffect(() => {
    if (amount <= 0 || confirmed) return;
    // PaymentSection first allocates the canonical payment row above. Waiting
    // for its id avoids minting a temporary lead-level token with payment_id
    // null and then racing a second token request after the intent resolves.
    if (stepNo !== undefined && slipField && !paymentId) return;
    let cancelled = false;
    apiFetch("/api/pay-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, amount, description: paymentTitle, installment: amountLabel, payment_id: paymentId }),
    }).then((r: { token: string }) => {
      if (!cancelled) setPayToken(r.token);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [leadId, amount, paymentTitle, amountLabel, paymentId, confirmed, stepNo, slipField]);

  const qrEnabled = !onlyOther && settings.promptpay_qr_enabled !== "false";
  const linkEnabled = !onlyOther && settings.promptpay_link_enabled !== "false";
  const bankEnabled = !onlyOther && settings.bank_account_enabled !== "false";
  const chequeEnabled = !onlyOther && !!allowCheque;
  const otherEnabled = onlyOther ? true : settings.other_payment_enabled === "true";
  const taxId = settings.promptpay_tax_id || "";
  const companyShort = settings.company_short_name || "SENA SOLAR";
  const companyFull = settings.company_name || "SENA SOLAR ENERGY CO., LTD.";
  const bankName = settings.bank_account_bank || "";
  const bankBranch = settings.bank_account_branch || "";
  const bankNumber = settings.bank_account_number || "";
  const bankAccountName = settings.bank_account_name || "";

  const payUrl = typeof window !== "undefined" && payToken ? `${window.location.origin}/pay/${payToken}` : "";
  const invoiceDocUrl = payToken ? `/api/invoice/${payToken}?format=pdf` : "";
  const effectiveDocUrl = docUrl || invoiceDocUrl;

  const sendViaLine = async (type: "qr" | "link" | "bank") => {
    if (!lineId) return;
    setLineConfirmType(null);
    setLineSending(type);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const qrParams = new URLSearchParams({ amount: String(qrAmount), format: "image" });
      if (leadId) qrParams.set("lead_id", String(leadId));
      if (stepNo) qrParams.set("step_no", String(stepNo));
      if (paymentNo) qrParams.set("ref2", paymentNo);
      const qrImageUrl = type === "qr" ? `${origin}/api/qr?${qrParams.toString()}` : undefined;
      const bankDetails = type === "bank" ? [
        { label: "ธนาคาร", value: `${bankName}${bankBranch ? " · " + bankBranch : ""}` },
        { label: "เลขบัญชี", value: bankNumber },
        { label: "ชื่อบัญชี", value: bankAccountName },
      ] : [];
      const fullDocUrl = effectiveDocUrl ? (effectiveDocUrl.startsWith("http") ? effectiveDocUrl : `${origin}${effectiveDocUrl}`) : "";
      const messages = [buildPaymentFlex({
        origin,
        title: paymentTitle,
        amount: qrAmount,
        name: leadName,
        actionLabel: fullDocUrl ? "ดูเอกสาร" : "ดู QR / ชำระเงิน",
        actionUrl: fullDocUrl || payUrl,
        qrUrl: qrImageUrl,
        note: type === "bank"
          ? paymentNote || `โอนเข้าบัญชี ${companyShort}`
          : paymentNote || `PromptPay Tax ID: ${taxId}  •  ${companyShort}`,
        details: type === "bank" ? [...bankDetails, ...(details || [])] : details,
      })];
      await apiFetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, messages }),
      });
      setLineSent(type);
      setTimeout(() => setLineSent(null), 3000);
    } catch {
      setLineSent("error");
      setTimeout(() => setLineSent(null), 3000);
    } finally {
      setLineSending(null);
    }
  };

  // Upload one slip: temp disk → Gemini verify → persist to slip_files staging.
  // Appends to slips[]; never replaces existing verified entries.
  const addSlip = async (file: File) => {
    if (confirmed) return;
    if (slips.length >= MAX_SLIPS) return;

    const tempKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reader = new FileReader();
    const dataUrlPromise = new Promise<string>((resolve) => {
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
    const previewUrl = await dataUrlPromise;

    setSlips((prev) => [...prev, { key: tempKey, url: previewUrl, status: "verifying" }]);
    log("upload_start", { filename: file.name, size: file.size, mime: file.type, expected_amount: amount, current_count: slips.length });

    try {
      // Skip Gemini for now — single round-trip directly to staging.
      // (Previous flow uploaded to /api/upload temp, then called verify-slip,
      //  then re-uploaded to /api/slips, then deleted temp = 4 round-trips.)
      const compressed = await compressSlipFile(file);
      const storeForm = new FormData();
      storeForm.append("file", compressed);
      storeForm.append("lead_id", String(leadId));
      storeForm.append("slip_field", slipField);
      const storeRes = await apiFetch("/api/slips", { method: "POST", body: storeForm }) as { id: number; url: string };

      log("slip_saved", { db_url: storeRes.url });
      setSlips((prev) => prev.map((s) => s.key === tempKey
        ? {
            key: `slip-${storeRes.id}`,
            url: storeRes.url,
            status: "verified" as const,
            slipFilesId: storeRes.id,
            filename: file.name,
            submittedAt: null, // draft — uploader must explicitly submit
          }
        : s));

      if (!verifiedFiredRef.current) {
        verifiedFiredRef.current = true;
        onVerified?.(storeRes.url);
      }
    } catch (e) {
      console.error("addSlip failed:", e);
      setSlips((prev) => prev.map((s) => s.key === tempKey ? { ...s, status: "failed" as const, error: "อัปโหลดไม่สำเร็จ" } : s));
    }
  };

  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (tab === "other") addSlipDirect(file);
    else addSlip(file);
  };

  // "Other" payment method bypasses OCR verify — upload the file and stage it
  // directly as a verified slip so the confirm button enables immediately.
  const addSlipDirect = async (file: File) => {
    if (confirmed) return;
    if (slips.length >= MAX_SLIPS) return;
    const tempKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reader = new FileReader();
    const dataUrl = await new Promise<string>(resolve => {
      reader.onload = ev => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
    setSlips(prev => [...prev, { key: tempKey, url: dataUrl, status: "verifying" }]);
    try {
      const compressed = await compressSlipFile(file);
      const form = new FormData();
      form.append("file", compressed);
      form.append("lead_id", String(leadId));
      form.append("slip_field", slipField);
      const storeRes = await apiFetch("/api/slips", { method: "POST", body: form }) as { id: number; url: string };
      setSlips(prev => prev.map(s => s.key === tempKey
        ? { key: `slip-${storeRes.id}`, url: storeRes.url, status: "verified" as const, slipFilesId: storeRes.id, filename: file.name, submittedAt: null }
        : s));
      if (!verifiedFiredRef.current) {
        verifiedFiredRef.current = true;
        onVerified?.(storeRes.url);
      }
    } catch (e) {
      console.error("addSlipDirect failed:", e);
      setSlips(prev => prev.map(s => s.key === tempKey ? { ...s, status: "failed" as const, error: "อัปโหลดไม่สำเร็จ" } : s));
    }
  };

  // Two-step flow — uploader first uploads (status=draft, submitted_at=null),
  // then explicitly clicks "ยืนยันส่งให้ทีมบัญชี" to mark all draft slips as
  // submitted. Only submitted slips show up in the accountant's queue.
  const draftSlips = slips.filter(s => s.status === "verified" && s.slipFilesId && !s.submittedAt);
  const submittedSlips = slips.filter(s => s.status === "verified" && s.submittedAt);
  const [submitting, setSubmitting] = useState(false);
  const paymentDetailRequired = tab === "other" && !chequePayment;
  const paymentDetailMissing = paymentDetailRequired && otherMethod.trim().length === 0;
  const submitDrafts = async () => {
    if (submitting || draftSlips.length === 0 || paymentDetailMissing) return;
    setSubmitting(true);
    setConfirmError(null);
    try {
      await Promise.all(draftSlips.map(s =>
        apiFetch(`/api/slips/${s.slipFilesId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submit: true,
            payment_detail: paymentDetailRequired ? otherMethod.trim() : null,
          }),
        })
      ));
      const stamp = new Date().toISOString();
      setSlips(prev => prev.map(s => draftSlips.find(d => d.key === s.key) ? { ...s, submittedAt: stamp } : s));
      // Server clears any prior rejection note for this slip_field on submit;
      // refresh so the banner disappears.
      await loadRejectNote();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "ส่งให้ฝ่ายบัญชีไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };
  // Remove a single slip. Staging rows DELETE /api/slips/:id; failed-temp entries
  // just clean the disk file. Confirmed slots (after ยืนยัน) can't be removed —
  // use ถอย payment to rollback the entire row.
  const removeSlip = async (entry: SlipEntry) => {
    if (confirmed) return;
    log("slip_removed", { key: entry.key, url: entry.url, status: entry.status });
    if (entry.slipFilesId) {
      fetch(`/api/slips/${entry.slipFilesId}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() } }).catch(() => {});
    } else if (entry.tempFileUrl) {
      fetch(`/api/upload?file=${encodeURIComponent(entry.tempFileUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() } }).catch(() => {});
    }
    setSlips((prev) => prev.filter((s) => s.key !== entry.key));
  };

  const verifiedCount = slips.filter((s) => s.status === "verified").length;
  const anyVerifying = slips.some((s) => s.status === "verifying");
  const canAddMore = !confirmed && slips.length < MAX_SLIPS;
  // Two-step gate: accountant's "ยืนยันรับชำระเงิน" only enables after the
  // uploader has marked drafts as submitted. While drafts exist, only the
  // amber "ยืนยันส่งให้ทีมบัญชี" button is actionable.
  const hasUnsubmittedDraft = slips.some(s => s.status === "verified" && s.slipFilesId && !s.submittedAt);
  const canConfirm = !confirmed && verifiedCount > 0 && !anyVerifying && !hasUnsubmittedDraft && (tab !== "other" || chequePayment || otherMethod.trim().length > 0);

  const handleConfirm = async () => {
    if (stepNo === undefined || confirming || confirmed || !canConfirm) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const desc = (tab === "other" || tab === "cheque") && (otherMethod.trim() || chequePayment)
        ? `${description ?? ""}${description ? " · " : ""}ชำระโดย: ${chequePayment ? "เช็ค" : otherMethod.trim()}`.trim()
        : description;
      await apiFetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          step_no: stepNo,
          slip_field: slipField,
          doc_no: docNo ?? null,
          amount,
          description: desc ?? null,
          payment_method: effectivePaymentMethod,
        }),
      });
      await onConfirmed?.();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  };

  const slipInputId = `slip-${slipField}`;

  const lineBtnClass = (sentType: "qr" | "link" | "bank") =>
    `w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
      confirmed ? "bg-gray-100 text-gray-400 cursor-not-allowed"
      : lineSent === sentType ? "bg-emerald-500 text-white"
      : lineSent === "error" ? "bg-red-500 text-white"
      : !lineId ? "bg-gray-200 text-gray-400 cursor-not-allowed"
      : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
    }`;
  const lineBtnLabel = (type: "qr" | "link" | "bank") =>
    lineSending === type ? "กำลังส่ง..."
    : lineSent === type ? "✓ ส่งแล้ว"
    : lineSent === "error" ? "ส่งไม่สำเร็จ"
    : !lineId ? "ยังไม่ได้เชื่อม LINE"
    : type === "qr" ? "ส่ง QR ให้ลูกค้า"
    : type === "link" ? "ส่งลิ้งค์ให้ลูกค้า"
    : "ส่งบัญชีให้ลูกค้า";

  // "ใบขอให้โอนเงิน" download — only visible once we have a pay token (which
  // is what the public /invoice/[token] page keys off). We hit the PDF
  // endpoint via fetch + blob so the browser saves the file under the lead's
  // name instead of dumping it inline.
  const downloadInvoice = async () => {
    if (!invoiceDocUrl) return;
    try {
      const res = await fetch(invoiceDocUrl, { headers: { ...getUserIdHeader() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ใบแจ้งชำระเงิน_${leadName || leadId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("invoice download failed", e);
      dialog.alert({ title: "ดาวน์โหลดไม่สำเร็จ", message: "โหลด PDF ไม่สำเร็จ", variant: "danger" });
    }
  };

  // Temporary receipt — only after the payment is confirmed. The /api/receipt
  // endpoint takes a stage code that mirrors the slip_field (deposit /
  // order_before / order_after) or "installment" + payment_id for the
  // dynamic per-row flow used by OrderStep งวดชำระเงิน.
  const receiptStage = slipField === "pre_slip_url" ? "deposit"
    : slipField === "order_before_slip" ? "order_before"
    : slipField === "order_after_slip" ? "order_after"
    : /^order_installment_\d+$/.test(slipField) ? "installment"
    : null;
  const installmentPayId = receiptStage === "installment" && slipUrl?.startsWith("/api/payments/")
    ? slipUrl.split("/").pop()
    : null;
  const downloadReceipt = async () => {
    if (!receiptStage) return;
    try {
      const title = "TEMPORARY RECEIPT";
      const installmentQs = installmentPayId ? `&payment_id=${installmentPayId}` : "";
      const url = `/api/receipt?lead_id=${leadId}&stage=${receiptStage}${installmentQs}&format=pdf&title=${encodeURIComponent(title)}`;
      const res = await fetch(url, { headers: { ...getUserIdHeader() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `ใบเสร็จรับเงินชั่วคราว_${leadName || leadId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("receipt download failed", e);
      dialog.alert({ title: "ดาวน์โหลดไม่สำเร็จ", message: "โหลด PDF ไม่สำเร็จ", variant: "danger" });
    }
  };

  return (
    <div className="space-y-3 relative">
      <div className={`flex flex-wrap items-start gap-2 ${hideHeader ? "justify-start" : "justify-between"}`}>
        {!hideHeader && (waiverEnabled ? (
          // Pre-survey header: title + 2 vertical radio rows. Row 1 inlines the
          // existing amount + pencil edit; row 2 is the ฟรีค่าสำรวจ option.
          <div>
            {paymentTitle && <div className="text-sm font-semibold text-gray-900">{paymentTitle}</div>}
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="radio"
                  name={`fee-type-${leadId}`}
                  className="w-4 h-4 accent-amber-600 cursor-pointer"
                  checked={localFeeType === "normal"}
                  disabled={confirmed}
                  onChange={() => { setLocalFeeType("normal"); onFeeTypeChange?.("normal"); }}
                />
                <span
                  className="flex items-center gap-1 cursor-pointer"
                  onClick={() => {
                    if (confirmed || amountEditing) return;
                    if (localFeeType !== "normal") { setLocalFeeType("normal"); onFeeTypeChange?.("normal"); }
                  }}
                >
                  {amountLabel ? `${amountLabel} ` : ""}
                  {amountEditing ? (
                    <input
                      type="number"
                      autoFocus
                      value={amountDraft}
                      min={0}
                      step={100}
                      onChange={e => setAmountDraft(e.target.value)}
                      onBlur={commitAmount}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => {
                        if (e.key === "Enter") commitAmount();
                        if (e.key === "Escape") { setAmountDraft(String(qrAmount)); setAmountEditing(false); }
                      }}
                      className="w-24 h-6 px-1.5 rounded border border-primary font-mono text-right text-xs focus:outline-none"
                      style={{ minHeight: 0 }}
                    />
                  ) : (
                    <span>{formatTHB(qrAmount)}</span>
                  )}
                  <span>บาท</span>
                  {onAmountEdit && !amountEditing && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setAmountDraft(String(qrAmount)); setAmountEditing(true); }}
                      className="ml-1 text-gray-400 hover:text-primary transition-colors"
                      title="แก้ไขจำนวน"
                      style={{ minHeight: 0 }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
                    </button>
                  )}
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-500">
                <input
                  type="radio"
                  name={`fee-type-${leadId}`}
                  className="w-4 h-4 accent-amber-600 cursor-pointer"
                  checked={localFeeType === "free"}
                  disabled={confirmed}
                  onChange={() => { setLocalFeeType("free"); onFeeTypeChange?.("free"); }}
                />
                <span>ฟรีค่าสำรวจ</span>
              </label>
            </div>
          </div>
        ) : (
          <PaymentHeader title={paymentTitle} amount={qrAmount} amountLabel={amountLabel} onAmountEdit={onAmountEdit} />
        ))}
        {/* Mobile: 4-col grid below header so every doc tile lines up with the
            ActualReceiptUpload thumbnails (same pattern as InstallmentReceiptList).
            Desktop: shrink-0 inline-flex on the right (existing layout). */}
        <div className="w-full md:w-auto md:shrink-0 grid grid-cols-4 gap-2 md:flex md:items-center md:gap-1">
          {invoiceDocUrl && !effectiveWaived && (
            <>
              {/* Mobile tile + caption */}
              <div className="md:hidden flex flex-col gap-1">
                <button
                  type="button"
                  onClick={downloadInvoice}
                  aria-label="ดาวน์โหลดใบแจ้งชำระเงิน (PDF)"
                  className="aspect-square w-full inline-flex items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                >
                  <DownloadIcon className="w-6 h-6" strokeWidth={1.8} />
                </button>
                <span className="text-xs text-center text-gray-600 truncate leading-tight font-medium">ใบแจ้งชำระ</span>
              </div>
              {/* Desktop icon + text inline */}
              <button
                type="button"
                onClick={downloadInvoice}
                className="hidden md:inline-flex items-center gap-1 h-8 px-2 rounded-lg text-active hover:bg-active/10 transition-colors"
                title="ดาวน์โหลดใบแจ้งชำระเงิน (PDF)"
                aria-label="ดาวน์โหลดใบแจ้งชำระเงิน (PDF)"
              >
                <DownloadIcon className="w-4 h-4" strokeWidth={2} />
                <span className="text-xs font-semibold">ใบแจ้งชำระเงิน</span>
              </button>
            </>
          )}
          {confirmed && receiptStage && !actualReceiptUrl && (
            <>
              {/* Mobile tile + caption */}
              <div className="md:hidden flex flex-col gap-1">
                <button
                  type="button"
                  onClick={downloadReceipt}
                  aria-label="ดาวน์โหลดใบเสร็จรับเงินชั่วคราว (PDF)"
                  className="aspect-square w-full inline-flex items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                >
                  <DownloadIcon className="w-6 h-6" strokeWidth={1.8} />
                </button>
                <span className="text-xs text-center text-gray-600 truncate leading-tight font-medium">ใบเสร็จ</span>
              </div>
              {/* Desktop icon + text inline */}
              <button
                type="button"
                onClick={downloadReceipt}
                className="hidden md:inline-flex items-center gap-1 h-8 px-2 rounded-lg text-gray-400 hover:text-active hover:bg-active/5 transition-colors"
                title="ดาวน์โหลดใบเสร็จรับเงินชั่วคราว (PDF)"
                aria-label="ดาวน์โหลดใบเสร็จรับเงินชั่วคราว (PDF)"
              >
                <DownloadIcon className="w-4 h-4" strokeWidth={2} />
                <span className="text-xs font-semibold">ใบเสร็จรับเงินชั่วคราว</span>
              </button>
            </>
          )}
          {confirmed && installmentPayId && (
            <ActualReceiptUpload
              leadId={leadId}
              paymentId={parseInt(installmentPayId)}
              url={actualReceiptUrl}
              fileLabel={`lead_${leadId}_pay${installmentPayId}`}
              refresh={async () => {
                // Reload local actual_receipt_url from /api/payments/<id>?list=1
                try {
                  const res = await fetch(`/api/payments/${installmentPayId}?list=1`, {
                    headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
                  });
                  if (res.ok) {
                    const d = await res.json();
                    setActualReceiptUrl(d.actual_receipt_url || null);
                  }
                } catch { /* ignore */ }
              }}
              compact
            />
          )}
        </div>
      </div>

      {/* Tabs (hide if only one enabled) */}
      {[qrEnabled, linkEnabled, bankEnabled, chequeEnabled, otherEnabled].filter(Boolean).length > 1 && (() => {
        const methodForTab: Record<string, string> = { qr: "qr", link: "link", bank: "bank_transfer", cheque: "cheque", other: "other" };
        const CheckBadge = () => (
          <svg className="w-4 h-4 text-emerald-500 mr-1 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="ชำระแล้ว">
            <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
        );
        // ฟรีค่าสำรวจ → ทุก tab ยังโชว์อยู่ แต่กดได้แค่ "อื่นๆ" (เกรย์ปุ่มอื่นและ disable click)
        const lockOthers = effectiveWaived;
        const tabBtnCls = (t: string, locked: boolean) => `flex-1 pb-2.5 text-xs md:text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center justify-center whitespace-nowrap ${
          locked ? "text-gray-300 border-transparent cursor-not-allowed" :
          tab === t ? "text-active border-active cursor-pointer" : "text-gray-400 border-transparent hover:text-gray-600 cursor-pointer"
        }`;
        return (
          <div className="flex border-b border-gray-200 -mx-3 px-3">
            {qrEnabled && (
              <button type="button" disabled={lockOthers} onClick={() => setTab("qr")} className={tabBtnCls("qr", lockOthers)}>
                {confirmedMethod === methodForTab.qr && <CheckBadge />}
                Thai QR
              </button>
            )}
            {linkEnabled && (
              <button type="button" disabled={lockOthers} onClick={() => setTab("link")} className={tabBtnCls("link", lockOthers)}>
                {confirmedMethod === methodForTab.link && <CheckBadge />}
                Payment Link
              </button>
            )}
            {bankEnabled && (
              <button type="button" disabled={lockOthers} onClick={() => setTab("bank")} className={tabBtnCls("bank", lockOthers)}>
                {confirmedMethod === methodForTab.bank && <CheckBadge />}
                Bank Account
              </button>
            )}
            {chequeEnabled && (
              <button type="button" disabled={lockOthers} onClick={() => setTab("cheque")} className={tabBtnCls("cheque", lockOthers)}>
                {confirmedMethod === methodForTab.cheque && <CheckBadge />}
                เช็ค
              </button>
            )}
            {otherEnabled && (
              <button type="button" onClick={() => setTab("other")} className={tabBtnCls("other", false)}>
                {confirmedMethod === methodForTab.other && <CheckBadge />}
                อื่นๆ
              </button>
            )}
          </div>
        );
      })()}

      {/* Thai QR Tab */}
      {qrEnabled && tab === "qr" && (
        <div className="space-y-3">
          <div className="max-w-[280px] mx-auto">
            <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center gap-2">
              <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center">
                {qrLoading ? <span className="text-white text-xs tracking-wider">LOADING…</span>
                 : qrError ? <span className="text-white text-xs">{qrError}</span>
                 : qrDataUrl ? <img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full object-contain p-2 bg-white rounded-lg" />
                 : <span className="text-white text-sm font-semibold tracking-wider uppercase">NO QR</span>}
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-700">{companyFull}</div>
                <div className="text-xxs text-gray-500 font-mono tabular-nums mt-0.5">
                  {qrMode === "bill_payment"
                    ? `Bill Payment · Biller ${settings.promptpay_biller_id || ""}`
                    : `PromptPay Tax ID: ${taxId}`}
                </div>
              </div>
            </div>
          </div>
          {/* Ref1 / Ref2 — single line, click to copy combined string. */}
          {qrMode === "bill_payment" && (qrRef1 || qrRef2) && (() => {
            const combined = [qrRef1, qrRef2].filter(Boolean).join(" / ");
            return (
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(combined); setRefCopied("ref1"); setTimeout(() => setRefCopied(null), 1500); }}
                className="block mx-auto text-center font-mono tabular-nums text-sm text-gray-700 hover:text-active"
              >
                {combined}{refCopied && <span className="text-emerald-600 ml-1">✓</span>}
              </button>
            );
          })()}
          <button type="button" disabled={confirmed || lineSending === "qr" || !lineId} onClick={() => setLineConfirmType("qr")} className={lineBtnClass("qr")}>
            {lineBtnLabel("qr")}
          </button>
        </div>
      )}

      {/* Payment Link Tab */}
      {linkEnabled && tab === "link" && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500">ส่งลิ้งค์นี้ให้ลูกค้าเปิดบนมือถือเพื่อสแกน QR</div>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลิ้งค์ชำระเงิน</div>
            <div className="text-xs font-mono text-gray-800 break-all mt-0.5">{payUrl || "กำลังสร้างลิ้งค์…"}</div>
            <div className="flex justify-end mt-2">
              <button type="button" disabled={!payUrl} onClick={() => {
                navigator.clipboard.writeText(payUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }} className="h-8 px-3 rounded-md text-xs font-semibold bg-active text-white hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer">
                {linkCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
          <button type="button" disabled={confirmed || lineSending === "link" || !lineId || !payUrl} onClick={() => setLineConfirmType("link")} className={lineBtnClass("link")}>
            {lineBtnLabel("link")}
          </button>
        </div>
      )}

      {/* Bank Account Tab */}
      {bankEnabled && tab === "bank" && (
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
            <div>
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ธนาคาร</div>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{bankName}</div>
              {bankBranch && <div className="text-xs text-gray-500">สาขา {bankBranch}</div>}
            </div>
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">เลขบัญชี</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="text-base font-bold font-mono tabular-nums text-gray-900 flex-1 min-w-0">{bankNumber}</div>
                <button
                  type="button"
                  title="คัดลอกข้อมูลธนาคารทั้งหมด"
                  onClick={() => {
                    const all = [
                      `ธนาคาร ${bankName}${bankBranch ? ` สาขา${bankBranch}` : ""}`,
                      `เลขบัญชี ${bankNumber}`,
                      `ชื่อบัญชี ${bankAccountName}`,
                    ].join("\n");
                    navigator.clipboard.writeText(all);
                    setBankCopied("all");
                    setTimeout(() => setBankCopied(null), 2000);
                  }}
                  className="shrink-0 w-9 h-8 rounded-md flex items-center justify-center text-active hover:bg-active/10 transition-all cursor-pointer"
                >
                  {bankCopied === "all" ? (
                    <CheckIcon className="w-5 h-5" strokeWidth={2.5} />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ชื่อบัญชี</div>
              <div className="text-sm font-semibold text-gray-900 break-words mt-0.5">{bankAccountName}</div>
            </div>
          </div>
          <button type="button" disabled={confirmed || lineSending === "bank" || !lineId} onClick={() => setLineConfirmType("bank")} className={lineBtnClass("bank")}>
            {lineBtnLabel("bank")}
          </button>
        </div>
      )}

      {/* Cheque Tab — physical receipt lets the workflow continue; it is not
          counted as cash until Accounting confirms that the cheque cleared. */}
      {chequeEnabled && tab === "cheque" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <div className="font-semibold">ชำระด้วยเช็ค</div>
          <div className="text-xs mt-1">อัปโหลดภาพเช็คแล้วส่งให้ฝ่ายบัญชียืนยันรับเช็ค เมื่อรับเช็คแล้วสามารถดำเนินงานต่อได้ และฝ่ายบัญชีจะยืนยันรับเงินอีกครั้งเมื่อเงินเข้าจริง</div>
        </div>
      )}

      {/* Other Method Tab — free-text method + direct file upload (no OCR verify) */}
      {otherEnabled && tab === "other" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชำระโดย / รายละเอียด <span className="text-red-500">*</span></label>
            <textarea
              value={otherMethod}
              onChange={e => { setOtherMethod(e.target.value); onOtherMethodChange?.(e.target.value); }}
              placeholder="รับชำระรูปแบบอื่นๆ เช่น สินเชื่อ, Home Equity (โปรดระบุให้ละเอียด เช่น ธนาคาร, วงเงิน, ระยะเวลาผ่อน, ผ่อนต่อเดือน)"
              disabled={confirmed}
              rows={5}
              maxLength={150}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none disabled:bg-gray-50 ${paymentDetailMissing && slips.length > 0 ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-active"}`}
            />
            {paymentDetailMissing && slips.length > 0 && (
              <div className="mt-1 text-xs text-red-600">กรุณากรอกรายละเอียดการชำระก่อนส่งให้ฝ่ายบัญชี</div>
            )}
          </div>
        </div>
      )}

      {/* Slip upload — up to MAX_SLIPS grid */}
      <div className={confirmed ? "" : "pt-2 border-t border-gray-100"}>
        <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id={slipInputId} disabled={confirmed || !canAddMore} />

        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">
            {tab === "cheque" ? "หลักฐานเช็ค" : tab === "other" ? "หลักฐานการชำระ" : "สลิปโอนเงิน"}
            {/* ฟรีค่าสำรวจ → optional; ปกติ → required */}
            {waiverEnabled && (effectiveWaived
              ? <span className="text-gray-400 normal-case"> (Optional)</span>
              : <span className="text-red-500"> *</span>)}
          </div>
          {!confirmed && verifiedCount > 0 && tab !== "other" && (
            <div className="text-xs font-semibold text-emerald-700">✓ ตรวจแล้ว {verifiedCount}</div>
          )}
        </div>

        {/* Accountant rejection banner — sits at the top of the slip area so
            the uploader sees the reason before re-uploading. Cleared by the
            slip submit handler when ยืนยัน 1 fires (server-side). */}
        {rejectNote && !confirmed && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="min-w-0">
              <div className="font-semibold">บัญชีไม่อนุมัติ — กรุณา upload สลิปใหม่</div>
              <div className="mt-0.5 break-words">เหตุผล: {rejectNote.reason}</div>
              <div className="mt-0.5 text-red-500/80">โดย {rejectNote.by} · {new Date(rejectNote.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</div>
            </div>
          </div>
        )}

        {slips.length === 0 && slipsLoaded && !confirmed && (
          <label htmlFor={slipInputId} className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors">
            {tab === "cheque" ? "อัปโหลดภาพเช็ค" : tab === "other" ? "อัปโหลดหลักฐานการชำระ" : "กรุณาอัปโหลดสลิปโอนเงิน"}
          </label>
        )}

        {slips.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {slips.map((s, idx) => (
              <div key={s.key} className={`relative rounded-lg overflow-hidden border aspect-square bg-gray-50 ${
                s.status === "failed" ? "border-red-500 ring-1 ring-red-500/30"
                : s.status === "verifying" ? "border-amber-400"
                : "border-gray-200"
              }`}>
                <button
                  type="button"
                  onClick={() => setLightbox({ url: s.url, index: idx })}
                  className="absolute inset-0 w-full h-full p-0 border-0 cursor-zoom-in"
                  aria-label={`ดูสลิป ${idx + 1}`}
                  style={{ minHeight: 0 }}
                >
                  <img src={s.url} alt={s.filename || `slip ${idx + 1}`} className="w-full h-full object-cover pointer-events-none" />
                </button>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-white font-bold font-mono tabular-nums text-5xl md:text-6xl leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                    {idx + 1}
                  </span>
                </div>
                {s.status === "verifying" && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {s.status === "verified" && (
                  <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xxs font-bold pointer-events-none">✓</div>
                )}
                {s.status === "failed" && (
                  <div className="absolute inset-x-0 bottom-0 bg-red-500/90 text-white text-xxs font-semibold text-center py-0.5 px-1 truncate pointer-events-none" title={s.error}>{s.error || "ไม่ผ่าน"}</div>
                )}
                {!confirmed && !s.submittedAt && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeSlip(s); }}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white flex items-center justify-center text-xs z-10" style={{ minHeight: 0 }}>✕</button>
                )}
              </div>
            ))}
            {canAddMore && (
              <label htmlFor={slipInputId} className="rounded-lg border-2 border-dashed border-gray-300 aspect-square flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary hover:text-primary transition-colors cursor-pointer">
                <PlusIcon className="w-6 h-6" strokeWidth={1.8} />
                <span className="text-xxs font-semibold uppercase tracking-wider">เพิ่มสลิป</span>
              </label>
            )}
          </div>
        )}

        {/* Extracted fields — shown for the first verified slip that has any
            field parsed by Gemini. Helps admin reconcile without opening the
            image. doc_type chip indicates slip / cheque / paper. */}
        {(() => {
          const verified = slips.find(s => s.status === "verified" && s.extracted);
          const e = verified?.extracted;
          if (!e) return null;
          const docTypeLabel: Record<string, string> = { slip: "สลิปโอนเงิน", cheque: "เช็ค", paper: "ใบเสร็จ", other: "อื่นๆ" };
          const rows: Array<[string, string]> = [];
          if (e.doc_type) rows.push(["ประเภท", docTypeLabel[e.doc_type] || e.doc_type]);
          if (typeof e.amount === "number") rows.push(["ยอด", new Intl.NumberFormat("en-US").format(e.amount) + " บาท"]);
          if (e.datetime) rows.push(["วันเวลา", e.datetime.replace("T", " ").slice(0, 16)]);
          if (e.cheque_no) rows.push(["เลขเช็ค", e.cheque_no]);
          if (e.ref1) rows.push(["Ref1", e.ref1]);
          if (e.ref2) rows.push(["Ref2", e.ref2]);
          if (e.trans_id) rows.push(["Trans ID", e.trans_id]);
          if (rows.length === 0) return null;
          return (
            <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
              <div className="text-xxs font-semibold uppercase tracking-wider text-gray-400 mb-1">ค่าที่อ่านได้จากหลักฐาน</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-gray-400 w-16 shrink-0">{label}</span>
                    <span className="font-mono tabular-nums text-gray-800 break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {confirmed && (
          <div className="mt-3 space-y-2">
            <div className="w-full h-11 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">
              {effectiveWaived
                ? "✓ ฟรีค่าสำรวจ — ไม่ต้องชำระ"
                : confirmedMethod === "cheque"
                  ? "✓ รับเช็คแล้ว — รอฝ่ายบัญชียืนยันเงินเข้า"
                  : "✓ ยืนยันการชำระเงินเรียบร้อย"}
            </div>
            {isAdmin && slipUrl?.startsWith("/api/payments/") && (
              <button
                type="button"
                disabled={undoing}
                onClick={handleUndo}
                className="w-full h-8 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {undoing ? "กำลังถอย…" : "↺ ถอย payment (admin)"}
              </button>
            )}
          </div>
        )}

        {/* Single primary action button — label/handler swaps by stage:
              • Drafts present → Step 1 (uploader submits) "ยืนยันการชำระเงิน 1"
              • All submitted   → Step 2 (accountant confirms) "ยืนยันการชำระเงิน 2"
            One button, one position — same look as the existing confirm. */}
        {stepNo !== undefined && !confirmed && slips.length > 0 && (
          <>
            {hasUnsubmittedDraft ? (
              canStep1 && (
                <button
                  type="button"
                  disabled={submitting || anyVerifying || paymentDetailMissing}
                  onClick={submitDrafts}
                  className="w-full h-11 mt-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "กำลังส่ง…" : "ยืนยันการชำระเงิน 1"}
                </button>
              )
            ) : canStep2 ? (
              <button
                type="button"
                disabled={!canConfirm || confirming}
                onClick={handleConfirm}
                className={`w-full h-11 mt-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                  chequePayment
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-gradient-to-r from-primary to-primary-dark hover:brightness-110"
                }`}
              >
                {confirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    กำลังยืนยัน…
                  </>
                ) : (
                  `${confirmLabel || (chequePayment ? "ยืนยันรับเช็ค" : "ยืนยันการชำระเงิน 2")}${verifiedCount > 1 ? ` (${verifiedCount} สลิป)` : ""}`
                )}
              </button>
            ) : (
              // Roles ที่ทำ step 2 ไม่ได้ (sales/solar) → โชว์ปุ่มแบบ disabled
              // เพื่อให้รู้ว่ารอบัญชีอนุมัติอยู่ ไม่ใช่ปุ่มหายไป
              <button
                type="button"
                disabled
                className="w-full h-11 mt-3 rounded-lg text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                ⏳ {chequePayment ? "รอฝ่ายบัญชียืนยันรับเช็ค" : "รออนุมัติการรับชำระเงิน"}
              </button>
            )}
            {confirmError && (
              <div className="mt-2 text-xs text-red-600 text-center">{confirmError}</div>
            )}
            {anyVerifying && (
              <div className="mt-2 text-xs text-amber-600 text-center">กำลังตรวจสลิป… รอสักครู่</div>
            )}
            {/* Accountant / admin reject — visible at submitted state only.
                Wipes all staging slips, records the reason on the lead, logs
                an activity, and shows a banner to the uploader. */}
            {!hasUnsubmittedDraft && submittedSlips.length > 0 && canStep2 && (
              <button
                type="button"
                onClick={() => { setRejectReason(""); setRejectOpen(true); }}
                className="w-full h-8 mt-2 rounded-lg text-sm font-semibold text-red-600 border border-red-300 bg-white hover:bg-red-50 flex items-center justify-center gap-1.5"
              >
                ✗ ไม่อนุมัติ / ส่งกลับให้ upload ใหม่
              </button>
            )}
          </>
        )}
      </div>

      {/* Slip lightbox */}
      {lightbox && (
        <ImageLightbox
          images={slips.map((s, i) => ({ url: s.url, label: `สลิป ${i + 1} / ${slips.length}` }))}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox({ url: slips[i].url, index: i })}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* LINE confirm modal */}
      {lineConfirmType && (
        <LineConfirmModal
          name={leadName}
          description={lineConfirmType === "qr" ? "ส่ง QR ชำระเงิน" : lineConfirmType === "link" ? "ส่งลิ้งค์ชำระเงิน" : "ส่งบัญชีธนาคาร"}
          onCancel={() => setLineConfirmType(null)}
          onConfirm={() => sendViaLine(lineConfirmType)}
        />
      )}

      {/* Reject reason modal — accountant gate. Hard-blocks submit until
          a non-empty reason is typed so the uploader always sees an actionable
          message instead of a silent rollback. */}
      {rejectOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          onClick={() => !rejecting && setRejectOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-1">ไม่อนุมัติการชำระเงิน</h3>
            <p className="text-xs text-gray-600 mb-3">สลิปงวดนี้จะถูกลบ แล้วส่งกลับให้ Sales อัปโหลดใหม่ กรุณาระบุเหตุผลให้ครบถ้วน</p>
            <label className="text-xs font-semibold text-gray-700 block mb-1">เหตุผล <span className="text-red-500">*</span></label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="เช่น: ยอดเงินไม่ตรงกับใบเสนอราคา / ผิดบัญชี / สลิปไม่ชัด"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-red-400 resize-none"
              autoFocus
            />
            <div className="mt-4 flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                disabled={rejecting}
                className="h-8 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={!rejectReason.trim() || rejecting}
                className="h-8 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {rejecting ? "กำลังส่ง…" : "ยืนยันไม่อนุมัติ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
