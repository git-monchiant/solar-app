"use client";
import { CameraIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, PlusIcon, UserIcon } from "@/components/ui/icons";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles, useMe } from "@/lib/roles";
import type { StepCommonProps } from "./types";
import FallbackImage from "@/components/ui/FallbackImage";
import PaymentSection from "@/components/payment/PaymentSection";
import PaymentSlipsThumbs from "@/components/payment/PaymentSlipsThumbs";
import ErrorPopup from "@/components/ui/ErrorPopup";
import AppointmentRescheduler from "@/components/calendar/AppointmentRescheduler";
import InstallChecklist from "../InstallChecklist";
import InstallDocModal from "../InstallDocModal";
import StepLayout from "../StepLayout";
import InstallmentReceiptList from "../InstallmentReceiptList";
import SignaturePad from "../SignaturePad";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import { compressImage } from "@/lib/utils/compressImage";
import { buildAppointmentFlex } from "@/lib/utils/line-flex";
import { formatTHB as fmt, formatThaiDate as formatDate } from "@/lib/utils/formatters";
import DoneSection from "./DoneSection";
import { COMBINED_EXTRA_MARKER, combinedPaymentDescription, parseCombinedPaymentAllocation } from "@/lib/combined-payment";

const SUB_STEPS = [
  ["นัดหมาย", "นัด"] as const,
  "ตรวจ",
  "สรุป คชจ.",
  "เก็บเงิน",
  "ส่งมอบ",
];

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function InstallStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const { me } = useMe();
  const { activeRoles } = useActiveRoles();
  const canConfirmChequeMoney = hasRole(activeRoles, "admin", "account");
  const fileViewer = useFileViewer();
  const [subStep, setSubStep] = useSubStep(`installSubStep_${lead.id}`, lead.install_confirmed ? 1 : 0, SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(lead.install_photos ? lead.install_photos.split(",").filter(Boolean) : []);
  // Install checklist (system_specs / visual_checks / function_tests) lives
  // in a separate table — fetch on mount so the done view can show a
  // summary alongside the plain install_note/photos fields.
  type ChecklistSpecs = {
    inverter?: { brand?: string; model?: string; kw?: number | null; phase?: string; sn?: string };
    panel?: { brand?: string; model?: string; count?: number | null; watt?: number | null; total_kwp?: number | null };
    battery?: { brand?: string; model?: string; kwh?: number | null };
    ac_dc_box_ongrid?: Record<string, { amp?: number | null; sqmm?: number | null }>;
    ac_dc_box_hybrid?: Record<string, { amp?: number | null; sqmm?: number | null }>;
  };
  type PassNote = { pass: boolean | null; note?: string };
  type FunctionTests = {
    voltage_1ph?: { ln?: number | null };
    voltage_3ph?: { l1n?: number | null; l1l2?: number | null; l3n?: number | null; l1l3?: number | null; l2n?: number | null; l2l3?: number | null };
    meter_size?: string | null;
    meter_amp?: number | null;
    current_kw?: number | null;
    pv1_volt?: number | null;
    pv2_volt?: number | null;
    inverter_ip?: PassNote;
    smart_meter_reverse?: PassNote;
    wifi_app?: PassNote;
    app_solar?: PassNote;
  };
  // Label maps for the detailed pass/fail rows — kept inline so the done
  // view is self-contained (no cross-file dep on InstallChecklist.tsx).
  const VISUAL_ITEMS = [
    { key: "panel_pos",        label: "2.1 ตำแหน่งแผงโซลาร์" },
    { key: "inverter_pos",     label: "2.2 ตำแหน่ง Inverter" },
    { key: "control_box_pos",  label: "2.3 ตู้ควบคุม" },
    { key: "battery_pos",      label: "2.4 ตำแหน่ง Battery" },
    { key: "junction_box",     label: "2.5 Junction Box" },
    { key: "pipe_install",     label: "2.6 งานเดินท่อ" },
    { key: "wire_way",         label: "2.7 Wire Way" },
    { key: "ground_weld",      label: "2.8 กราวด์ (Thermal weld)" },
    { key: "terminal_breaker", label: "2.9 Terminal / Breaker" },
    { key: "dc_pipe",          label: "2.10 ท่อสาย DC" },
  ] as const;
  const FUNCTION_PASS_FAIL = [
    { key: "inverter_ip",         label: "3.5 เชื่อมต่อ Inverter ผ่าน IP" },
    { key: "smart_meter_reverse", label: "3.6 Smart Meter กันย้อน" },
    { key: "wifi_app",            label: "3.7 WiFi ผ่าน App" },
    { key: "app_solar",           label: "3.8 App Solar ให้ลูกค้า" },
  ] as const;
  const ONGRID_BREAKERS = [
    { key: "mcb_dc_solar", label: "MCB DC SOLAR" },
    { key: "mcb_rcbo_ac",  label: "MCB RCBO AC" },
    { key: "mcb_dc",       label: "MCB DC" },
    { key: "mcb_ac_grid",  label: "MCB AC GRID" },
  ] as const;
  const HYBRID_BREAKERS = [
    { key: "mcb_dc_solar",  label: "MCB DC SOLAR" },
    { key: "ats",           label: "ATS" },
    { key: "mcb_rcbo_ac",   label: "MCB RCBO AC" },
    { key: "mcb_dc",        label: "MCB DC" },
    { key: "mcb_ac_grid",   label: "MCB AC GRID" },
    { key: "mcb_ac_backup", label: "MCB AC BACK UP" },
  ] as const;
  const METER_LABEL: Record<string, string> = {
    "5_15":   "5(15) A",
    "15_45":  "15(45) A",
    "30_100": "30(100) A",
    unknown:  "ไม่ทราบ",
  };
  const [checklist, setChecklist] = useState<{
    inspection_date: string | null;
    system_specs: string | null;
    visual_checks: string | null;
    function_tests: string | null;
    notes: string | null;
    submitted_at: string | null;
  } | null>(null);
  useEffect(() => {
    apiFetch(`/api/install-checklist/${lead.id}`)
      .then((r) => setChecklist(r))
      .catch(() => setChecklist(null));
  }, [lead.id]);
  // Merge install_photos + install_photos_extra so the done view shows both
  // together — the extra column was invisible before.
  const extraPhotos = lead.install_photos_extra ? lead.install_photos_extra.split(",").filter(Boolean) : [];
  const allPhotos = Array.from(new Set([...photos, ...extraPhotos]));
  const [note, setNote] = useState(lead.install_note || "");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraCost, setExtraCost] = useState<number>(lead.install_extra_cost || 0);
  const [extraNote, setExtraNote] = useState(lead.install_extra_note || "");
  const [, setAfterSlipDone] = useState(!!lead.order_after_slip);
  const [rescheduling, setRescheduling] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(lead.install_customer_signature_url);
  // Mobile → in-app PdfPreview modal. Desktop → new tab. Same UX as Warranty.
  const isMobile = useIsMobile();
  const [installDocPreviewOpen, setInstallDocPreviewOpen] = useState(false);
  const [actualDate, setActualDate] = useState<string>(
    lead.install_actual_date ? String(lead.install_actual_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  // PDF checklist that the customer must prepare for grid-connection (ขนานไฟ).
  // URL lives in app_settings — single global file, hidden if admin hasn't uploaded.
  // Download filename is rewritten per-customer at the <a download> attribute.
  const [checklistUrl, setChecklistUrl] = useState<string | null>(null);
  useEffect(() => {
    apiFetch("/api/settings").then((s: Record<string, string>) => {
      setChecklistUrl(s.customer_checklist_pdf_url || null);
    }).catch(() => {});
  }, []);

  // Auto-save note + extras. Removed the `state !== "active"` gate because the
  // editable form is sometimes still mounted (e.g. expanded done view) and a
  // user typing there expects the save to land regardless. Initial-mount fires
  // once with current values which is a no-op against unchanged DB rows.
  const flushSave = useCallback(() => {
    return apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_note: note || null, install_extra_note: extraNote || null, install_extra_cost: extraCost || null }),
    }).catch(console.error);
  }, [lead.id, note, extraNote, extraCost]);
  useEffect(() => {
    const t = setTimeout(flushSave, 800);
    return () => clearTimeout(t);
  }, [flushSave]);

  const pctBefore = lead.order_pct_before ?? 100;
  const orderTotal = lead.order_total || 0;
  const orderDiscount = Number(lead.order_discount_amount) || 0;
  const depositPaid = lead.pre_total_price || 0;
  // Net the customer actually owes = quoted price − VIP/customer discount −
  // ค่าจอง (already paid up front). Was missing the discount, so the install
  // step over-reported "ยอดคงค้าง" by exactly the discount amount.
  const netDue = Math.max(0, orderTotal - orderDiscount - depositPaid);
  // Paid amount across all confirmed per-installment payments.
  const [paidAmount, setPaidAmount] = useState(0);
  type InstallPaymentRow = {
    id: number;
    slip_field: string;
    amount: number;
    description: string | null;
    confirmed_at: string | null;
    payment_method: string | null;
    cheque_received_at: string | null;
    submitted_at?: string | null;
  };
  type PlannedInstallment = {
    pct?: number;
    when?: "before" | "after";
    method?: string;
    loan_bank?: string | null;
    cc_pct?: number | null;
  };
  const [paymentRows, setPaymentRows] = useState<InstallPaymentRow[]>([]);
  const [paymentStateLoaded, setPaymentStateLoaded] = useState(false);
  const [focusedAfterChequeId, setFocusedAfterChequeId] = useState<number | null>(null);
  const [confirmingAfterChequeId, setConfirmingAfterChequeId] = useState<number | null>(null);
  const [rejectingChequePayment, setRejectingChequePayment] = useState<InstallPaymentRow | null>(null);
  const [rejectChequeReason, setRejectChequeReason] = useState("");
  const [rejectingCheque, setRejectingCheque] = useState(false);
  const loadPaymentState = useCallback(async () => {
    try {
      const rows = await apiFetch(`/api/payments?lead_id=${lead.id}`) as InstallPaymentRow[];
      const sum = rows
        .filter(r => r.confirmed_at && /^order_installment_\d+$/.test(r.slip_field))
        .reduce((s, r) => s + Number(r.amount || 0), 0);
      setPaidAmount(sum);
      setPaymentRows(rows);
    } finally {
      setPaymentStateLoaded(true);
    }
  }, [lead.id]);
  useEffect(() => {
    loadPaymentState().catch(console.error);
  }, [loadPaymentState]);
  const remainingAmount = Math.max(0, netDue - paidAmount);
  const paymentForField = (slipField: string): InstallPaymentRow | null => {
    const candidates = paymentRows.filter(row => row.slip_field === slipField);
    return candidates.find(row => !!row.confirmed_at)
      ?? candidates.find(row => !!row.cheque_received_at)
      ?? candidates[0]
      ?? null;
  };
  const plannedInstallments: PlannedInstallment[] = (() => {
    try {
      const parsed = lead.order_installments ? JSON.parse(lead.order_installments) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const afterInstallmentPlans = plannedInstallments
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => plan.when === "after" && Number(plan.pct || 0) > 0);
  const hasStructuredAfterInstallments = afterInstallmentPlans.length > 0;
  const afterRows = paymentRows.filter(r => r.slip_field === "order_after_slip");
  const pendingAfterRow = afterRows.find(r => !r.confirmed_at) ?? null;
  const afterChequePending = afterRows.find(r => !r.confirmed_at
    && r.payment_method === "cheque" && !!r.cheque_received_at) ?? null;
  const afterPaymentRecordExists = afterRows.length > 0;
  const afterPaymentConfirmed = afterRows.some(r => !!r.confirmed_at);
  const afterPaymentReady = afterPaymentRecordExists
    ? afterPaymentConfirmed || !!afterChequePending
    : !!lead.order_after_paid;
  const afterChequePaymentUrl = afterChequePending ? `/api/payments/${afterChequePending.id}` : null;

  const extraRows = paymentRows.filter(r => /^install_extra_\d+$/.test(r.slip_field));
  const separatelyConfirmedExtraTotal = extraRows
    .filter(r => !!r.confirmed_at)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  // Before extra charges had their own payment fields, Step 05 saved a single
  // order_after_slip row whose description explicitly included the extra cost.
  // Treat that legacy confirmation as covering the current extra amount so an
  // already-paid customer is not asked to pay the same surcharge again.
  const legacyCombinedExtraPaid = afterRows
    .filter(row => !!row.confirmed_at && (row.description || "").includes(COMBINED_EXTRA_MARKER))
    .reduce((sum, row) => sum + (parseCombinedPaymentAllocation(row.description)?.extra
      ?? Math.max(0, Number(row.amount || 0) - remainingAmount)), 0);
  const structuredCombinedExtraPaid = afterInstallmentPlans.reduce((sum, { plan, index }) => {
    const row = paymentRows.find(candidate =>
      candidate.slip_field === `order_installment_${index}`
      && !!candidate.confirmed_at
      && (candidate.description || "").includes(COMBINED_EXTRA_MARKER),
    );
    if (!row) return sum;
    const allocation = parseCombinedPaymentAllocation(row.description);
    if (allocation) return sum + allocation.extra;
    const installmentAmount = Math.max(0, Math.round(netDue * Number(plan.pct || 0) / 100));
    return sum + Math.max(0, Number(row.amount || 0) - installmentAmount);
  }, 0);
  const confirmedExtraTotal = Math.min(
    extraCost,
    separatelyConfirmedExtraTotal + legacyCombinedExtraPaid + structuredCombinedExtraPaid,
  );
  const extraOutstanding = Math.max(0, extraCost - confirmedExtraTotal);
  const pendingExtraRow = extraRows.find(r => !r.confirmed_at && (!!r.submitted_at || !!r.cheque_received_at))
    ?? extraRows.find(r => !r.confirmed_at)
    ?? null;
  const extraChequePending = pendingExtraRow?.payment_method === "cheque" && pendingExtraRow.cheque_received_at
    ? pendingExtraRow
    : null;
  const usedExtraIndexes = extraRows
    .map(r => parseInt(r.slip_field.replace("install_extra_", ""), 10))
    .filter(Number.isFinite);
  const nextExtraIndex = usedExtraIndexes.length > 0 ? Math.max(...usedExtraIndexes) + 1 : 0;
  const extraSlipField = pendingExtraRow?.slip_field ?? `install_extra_${nextExtraIndex}`;
  const extraStepNo = 100 + (pendingExtraRow
    ? parseInt(pendingExtraRow.slip_field.replace("install_extra_", ""), 10) || 0
    : nextExtraIndex);
  const afterInstallmentStates = afterInstallmentPlans.map(({ plan, index }) => {
    const payment = paymentForField(`order_installment_${index}`);
    const allocation = parseCombinedPaymentAllocation(payment?.description);
    const percentageAmount = Math.max(0, Math.round(netDue * Number(plan.pct || 0) / 100));
    const plannedAmount = index === plannedInstallments.length - 1 && !payment?.confirmed_at
      ? remainingAmount
      : percentageAmount;
    const amount = allocation?.base
      ?? (payment && !(payment.description || "").includes(COMBINED_EXTRA_MARKER)
        ? Number(payment.amount || 0)
        : plannedAmount);
    const ready = !!payment?.confirmed_at || !!payment?.cheque_received_at;
    return { plan, index, payment, amount, ready };
  });
  const unpaidAfterInstallments = afterInstallmentStates.filter(item => !item.payment?.confirmed_at);
  const combinableAfterInstallments = unpaidAfterInstallments.filter(item =>
    (item.payment?.description || "").includes(COMBINED_EXTRA_MARKER)
    || (!item.payment?.submitted_at && !item.payment?.cheque_received_at),
  );
  const pendingExtraHasEvidence = !!pendingExtraRow?.submitted_at || !!pendingExtraRow?.cheque_received_at;
  const existingCombinedAfterInstallment = afterInstallmentStates.find(item =>
    (item.payment?.description || "").includes(COMBINED_EXTRA_MARKER),
  ) ?? null;
  const combinedAfterInstallment = existingCombinedAfterInstallment
    ?? (extraOutstanding > 0 && combinableAfterInstallments.length === 1 && !pendingExtraHasEvidence
        ? combinableAfterInstallments[0]
        : null);
  const combinedAfterChequePending = combinedAfterInstallment?.payment?.payment_method === "cheque"
    && combinedAfterInstallment.payment.cheque_received_at
    && !combinedAfterInstallment.payment.confirmed_at
    ? combinedAfterInstallment.payment
    : null;
  const existingLegacyCombinedRow = afterRows.find(row =>
    (row.description || "").includes(COMBINED_EXTRA_MARKER),
  ) ?? null;
  const legacyCombinedCreationActive = !hasStructuredAfterInstallments
    && remainingAmount > 0
    && extraOutstanding > 0
    && !pendingExtraHasEvidence
    && !existingLegacyCombinedRow;
  const legacyCombinedDisplay = !!existingLegacyCombinedRow || legacyCombinedCreationActive;
  const legacyCombinedBlocksExtra = legacyCombinedCreationActive
    || (!!existingLegacyCombinedRow && !existingLegacyCombinedRow.confirmed_at);
  const extraPaymentReady = extraOutstanding <= 0
    || !!extraChequePending
    || !!combinedAfterChequePending
    || (!!afterChequePending && (afterChequePending.description || "").includes(COMBINED_EXTRA_MARKER));
  const afterInstallmentsReady = afterInstallmentStates.every(item => item.ready);
  const afterInstallmentOutstanding = afterInstallmentStates
    .filter(item => !item.payment?.confirmed_at)
    .reduce((sum, item) => sum + item.amount, 0);
  const afterInstallmentToCollect = afterInstallmentStates
    .filter(item => !item.ready)
    .reduce((sum, item) => sum + item.amount, 0);
  const legacyBalanceToCollect = hasStructuredAfterInstallments ? 0 : remainingAmount;
  const collectPaymentReady = (
    hasStructuredAfterInstallments
      ? afterInstallmentsReady
      : (legacyBalanceToCollect <= 0 || afterPaymentReady)
  ) && extraPaymentReady;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `installChequeConfirm_${lead.id}`;
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    localStorage.removeItem(key);
    const paymentId = parseInt(raw, 10);
    if (Number.isInteger(paymentId) && paymentId > 0) setFocusedAfterChequeId(paymentId);
  }, [lead.id]);

  useEffect(() => {
    const focusedPayment = [
      afterChequePending,
      extraChequePending,
      ...afterInstallmentStates.map(item => item.payment?.cheque_received_at ? item.payment : null),
    ].find(payment => payment?.id === focusedAfterChequeId);
    if (!focusedAfterChequeId || !focusedPayment) return;
    const target = document.querySelector(`[data-install-cheque-confirm="${focusedAfterChequeId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedAfterChequeId, afterChequePending, extraChequePending, afterInstallmentStates]);

  // Upload only — returns the uploaded URL. Caller batches setPhotos + PATCH.
  // Multi-select used to race here: each parallel call read the same stale
  // `photos` closure, so [...photos, url] kept the last upload only.
  const uploadOne = async (file: File): Promise<string | null> => {
    const compressed = await compressImage(file).catch(() => file);
    const formData = new FormData();
    formData.append("file", compressed);
    formData.append("lead_id", String(lead.id));
    formData.append("type", "install");
    const res = await apiFetch("/api/upload", { method: "POST", body: formData });
    return res?.url ?? null;
  };

  const uploadPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    setNextError(null);
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const f of files) {
        const url = await uploadOne(f);
        if (url) newUrls.push(url);
      }
      if (newUrls.length === 0) return;
      const next = [...photos, ...newUrls];
      setPhotos(next);
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ install_photos: next.join(",") }),
      });
    } catch (error) {
      console.error("Install photo upload failed:", error);
      setNextError("อัปโหลดรูปส่งมอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally { setUploading(false); }
  };

  const removePhoto = async (idx: number) => {
    const newPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(newPhotos);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_photos: newPhotos.join(",") || null }),
    });
  };

  const [notifyLine, setNotifyLine] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<null | "ok" | "err">(null);

  const buildInstallMessage = () => {
    if (!lead.install_date) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildAppointmentFlex({
      origin,
      kind: "install",
      name: lead.full_name,
      date: lead.install_date,
      address: lead.installation_address,
      project: lead.project_name,
      packageLabel: lead.package_name,
      documents: [
        "สำเนาบัตรประชาชน",
        "สำเนาทะเบียนบ้าน",
        "บิลค่าไฟฟ้าล่าสุด",
        "หนังสือยินยอมให้ใช้สถานที่ (ถ้าชื่อมิเตอร์ไม่ตรง)",
        "หนังสือมอบอำนาจ (ถ้าให้บริษัทยื่นแทน)",
      ],
    });
  };

  const confirmAppointment = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ install_confirmed: true }),
      });
      if (notifyLine && lead.line_id) {
        const msg = buildInstallMessage();
        if (msg) {
          apiFetch("/api/line/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
          }).catch(console.error);
        }
      }
      setSubStep(1);
      await refresh();
    } finally { setSaving(false); }
  };

  const resendInstallLine = async () => {
    if (!lead.line_id) return;
    const msg = buildInstallMessage();
    if (!msg) return;
    setResending(true);
    setResendResult(null);
    try {
      await apiFetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
      });
      setResendResult("ok");
    } catch {
      setResendResult("err");
    } finally {
      setResending(false);
      setTimeout(() => setResendResult(null), 3000);
    }
  };

  const saveReschedule = async ({ date }: { date: string; slot: string }) => {
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_date: date, install_confirmed: false }),
    });
    setRescheduling(false);
    refresh();
  };

  // PaymentSection writes the payments row + flips order_after_paid itself.
  // Stay on the current sub-step — user clicks "ถัดไป" to proceed.
  const onAfterConfirmed = async () => {
    if (me?.id) {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_after_paid_by: me.id }),
      }).catch(console.error);
    }
    await loadPaymentState();
    await refresh();
  };

  const onExtraConfirmed = async () => {
    await loadPaymentState();
    await refresh();
  };

  const confirmAfterChequeMoney = async (payment: InstallPaymentRow) => {
    if (confirmingAfterChequeId) return;
    setConfirmingAfterChequeId(payment.id);
    setNextError(null);
    try {
      await apiFetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_received_money: true }),
      });
      setFocusedAfterChequeId(null);
      await refresh();
      await loadPaymentState();
    } catch (error) {
      setNextError(error instanceof Error ? error.message : "ยืนยันรับเงินจากเช็คไม่สำเร็จ");
    } finally {
      setConfirmingAfterChequeId(null);
    }
  };

  const rejectReceivedCheque = async () => {
    const payment = rejectingChequePayment;
    const reason = rejectChequeReason.trim();
    if (!payment || !reason || rejectingCheque) return;
    setRejectingCheque(true);
    setNextError(null);
    try {
      await apiFetch("/api/payments/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, slip_field: payment.slip_field, reason }),
      });
      setFocusedAfterChequeId(null);
      setRejectingChequePayment(null);
      setRejectChequeReason("");
      await loadPaymentState();
      await refresh();
    } catch (error) {
      setNextError(error instanceof Error ? error.message : "ส่งกลับให้ upload ใหม่ไม่สำเร็จ");
    } finally {
      setRejectingCheque(false);
    }
  };

  const closeStep = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          install_completed_at: true,
          status: "warranty",
          install_actual_date: actualDate || null,
          install_completed_by: me?.id ?? null,
        }),
      });
      await refresh();
    } finally { setSaving(false); }
  };

  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const openInstallDoc = () => {
    if (isMobile) setInstallDocPreviewOpen(true);
    else window.open(me?.id ? `/api/install-doc/${lead.id}?user_id=${me.id}` : `/api/install-doc/${lead.id}`, "_blank", "noreferrer");
  };

  // Left-aligned responsive row — same pattern as SurveyStep/PreSurveyStep.
  const doneRow = (label: React.ReactNode, value: React.ReactNode, opts?: { mono?: boolean }) => (
    <div className="flex gap-2 items-baseline justify-between lg:justify-start text-sm">
      <span className="text-gray-400 shrink-0 lg:w-40">{label}</span>
      <span className={`text-gray-800 min-w-0 text-right lg:text-left ${opts?.mono ? "font-mono tabular-nums" : ""}`}>{value}</span>
    </div>
  );
  const passCount = (json: string | null): { passed: number; failed: number; total: number } => {
    if (!json) return { passed: 0, failed: 0, total: 0 };
    try {
      const obj = JSON.parse(json) as Record<string, PassNote | unknown>;
      let passed = 0, failed = 0, total = 0;
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object" && "pass" in v) {
          total++;
          if ((v as PassNote).pass === true) passed++;
          else if ((v as PassNote).pass === false) failed++;
        }
      }
      return { passed, failed, total };
    } catch { return { passed: 0, failed: 0, total: 0 }; }
  };

  const renderDoneContent = () => {
    const specs: ChecklistSpecs = (() => {
      if (!checklist?.system_specs) return {};
      try { return JSON.parse(checklist.system_specs) as ChecklistSpecs; } catch { return {}; }
    })();
    const visualStats = passCount(checklist?.visual_checks ?? null);
    const funcStats = passCount(checklist?.function_tests ?? null);

    return (
    <>
      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        {lead.install_date && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
            <div className="text-xs font-bold text-gray-400 uppercase mb-0.5">วันที่ติดตั้ง</div>
            <div className="font-semibold text-gray-800 text-sm">
              {formatDate(lead.install_date)}
              {lead.install_date_end && lead.install_date_end !== lead.install_date && (
                <span> – {formatDate(lead.install_date_end)}</span>
              )}
            </div>
          </div>
        )}
        {lead.install_actual_date && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
            <div className="text-xs font-bold text-gray-400 uppercase mb-0.5">วันที่ติดตั้งเสร็จ</div>
            <div className="font-semibold text-gray-800 text-sm">{formatDate(lead.install_actual_date)}</div>
          </div>
        )}
        {lead.install_completed_at && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
            <div className="text-xs font-bold text-emerald-600 uppercase mb-0.5">วันที่ส่งมอบ</div>
            <div className="font-semibold text-emerald-700 text-sm">{formatDate(lead.install_completed_at)}</div>
          </div>
        )}
      </div>

      {/* เอกสารส่งมอบงานติดตั้ง — always render every checklist field, even
          when empty. Missing values fall back to "-" so the reviewer can see
          at a glance which parts still need filling. */}
      <DoneSection color="indigo" title="เอกสารส่งมอบงานติดตั้ง">
        <div className="space-y-0.5">
          {doneRow("เลขที่เอกสาร", lead.install_checklist_doc_no || "-", { mono: true })}
          {doneRow("วันที่ตรวจ", checklist?.inspection_date ? formatDate(checklist.inspection_date) : "-")}
          {doneRow("ส่งเอกสาร", checklist?.submitted_at ? formatDate(checklist.submitted_at) : "-")}
        </div>
      </DoneSection>

      {/* §1 อุปกรณ์ระบบ — always render Inverter / Panel / Battery rows so
          a partially-filled checklist reads the same shape as a complete one. */}
      <DoneSection color="blue" title="อุปกรณ์ระบบ (ตามใบส่งมอบ)">
        <div className="space-y-0.5">
          {doneRow(
            "Inverter",
            (() => {
              const parts: React.ReactNode[] = [];
              const nameStr = [specs.inverter?.brand, specs.inverter?.model].filter(Boolean).join(" ");
              if (nameStr) parts.push(nameStr);
              if (specs.inverter?.kw != null) parts.push(`${specs.inverter.kw} kW`);
              if (specs.inverter?.phase) parts.push(specs.inverter.phase.includes("1") ? "1 เฟส" : "3 เฟส");
              return parts.length > 0 ? parts.join(" · ") : "-";
            })()
          )}
          {doneRow("Inverter S/N", specs.inverter?.sn || "-", { mono: true })}
          {doneRow(
            "Solar Panel",
            (() => {
              const parts: React.ReactNode[] = [];
              const nameStr = [specs.panel?.brand, specs.panel?.model].filter(Boolean).join(" ");
              if (nameStr) parts.push(nameStr);
              const wattPart = specs.panel?.count != null || specs.panel?.watt != null
                ? `${specs.panel?.count ?? "-"} แผง × ${specs.panel?.watt ?? "-"}W`
                : null;
              if (wattPart) parts.push(wattPart);
              if (specs.panel?.total_kwp != null) parts.push(`${specs.panel.total_kwp} kWp`);
              return parts.length > 0 ? parts.join(" · ") : "-";
            })()
          )}
          {doneRow(
            "Battery",
            (() => {
              const parts: React.ReactNode[] = [];
              const nameStr = [specs.battery?.brand, specs.battery?.model].filter(Boolean).join(" ");
              if (nameStr) parts.push(nameStr);
              if (specs.battery?.kwh != null) parts.push(`${specs.battery.kwh} kWh`);
              return parts.length > 0 ? parts.join(" · ") : "-";
            })()
          )}
        </div>
      </DoneSection>

      {/* AC/DC BOX breakers — §1.5 (ON GRID) + §1.6 (HYBRID). Each row is
          [Amp | ขนาดสาย sq.mm] per breaker. */}
      <DoneSection color="violet" title="AC/DC BOX (§1.5 · §1.6)">
        <div className="space-y-2 text-sm">
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">1.5 ON GRID</div>
            <div className="space-y-0.5">
              {ONGRID_BREAKERS.map(b => {
                const v = specs.ac_dc_box_ongrid?.[b.key] || {};
                return doneRow(b.label, (
                  <span className="font-mono">
                    {v.amp != null ? `${v.amp} A` : "-"}
                    <span className="text-gray-400"> · </span>
                    {v.sqmm != null ? `${v.sqmm} sq.mm` : "-"}
                  </span>
                ));
              })}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1 mt-2">1.6 HYBRID</div>
            <div className="space-y-0.5">
              {HYBRID_BREAKERS.map(b => {
                const v = specs.ac_dc_box_hybrid?.[b.key] || {};
                return doneRow(b.label, (
                  <span className="font-mono">
                    {v.amp != null ? `${v.amp} A` : "-"}
                    <span className="text-gray-400"> · </span>
                    {v.sqmm != null ? `${v.sqmm} sq.mm` : "-"}
                  </span>
                ));
              })}
            </div>
          </div>
        </div>
      </DoneSection>

      {/* §2 Visual checks — 10 items with ✓/✗ + note per row. */}
      <DoneSection color="amber" title="งานติดตั้งระบบ (§2)">
        <div className="space-y-0.5">
          {(() => {
            const checks = checklist?.visual_checks ? (() => {
              try { return JSON.parse(checklist.visual_checks) as Record<string, PassNote>; } catch { return {}; }
            })() : {};
            return VISUAL_ITEMS.map(item => {
              const c = checks[item.key] || { pass: null } as PassNote;
              return doneRow(item.label, (
                <span className="inline-flex items-center gap-2">
                  {c.pass === true && <span className="text-emerald-700 font-semibold">✓ ผ่าน</span>}
                  {c.pass === false && <span className="text-red-600 font-semibold">✗ ไม่ผ่าน</span>}
                  {c.pass == null && <span className="text-gray-400">-</span>}
                  {c.note && <span className="text-gray-500 italic text-xs">· {c.note}</span>}
                </span>
              ));
            });
          })()}
        </div>
      </DoneSection>

      {/* §3 Voltage / meter / kW / PV readings */}
      {(() => {
        const tests: FunctionTests = checklist?.function_tests ? (() => {
          try { return JSON.parse(checklist.function_tests) as FunctionTests; } catch { return {}; }
        })() : {};
        const v3 = tests.voltage_3ph || {};
        const meterText = tests.meter_size
          ? (METER_LABEL[tests.meter_size] || tests.meter_size)
          : (tests.meter_amp != null ? `${tests.meter_amp} A` : "-");
        return (
          <DoneSection color="blue" title="การวัดค่าไฟฟ้า (§3)">
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">3.1 ระบบไฟ 1 เฟส</div>
                <div className="space-y-0.5">
                  {doneRow("L : N", tests.voltage_1ph?.ln != null ? `${tests.voltage_1ph.ln} V` : "-", { mono: true })}
                  {doneRow("ขนาดมิเตอร์", meterText)}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1 mt-2">3.2 ระบบไฟ 3 เฟส</div>
                <div className="space-y-0.5">
                  {doneRow("L1 : N",  v3.l1n  != null ? `${v3.l1n} V`  : "-", { mono: true })}
                  {doneRow("L1 : L2", v3.l1l2 != null ? `${v3.l1l2} V` : "-", { mono: true })}
                  {doneRow("L3 : N",  v3.l3n  != null ? `${v3.l3n} V`  : "-", { mono: true })}
                  {doneRow("L1 : L3", v3.l1l3 != null ? `${v3.l1l3} V` : "-", { mono: true })}
                  {doneRow("L2 : N",  v3.l2n  != null ? `${v3.l2n} V`  : "-", { mono: true })}
                  {doneRow("L2 : L3", v3.l2l3 != null ? `${v3.l2l3} V` : "-", { mono: true })}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1 mt-2">3.3 การผลิต / PV</div>
                <div className="space-y-0.5">
                  {doneRow("กำลังการผลิต", tests.current_kw != null ? `${tests.current_kw} kW` : "-", { mono: true })}
                  {doneRow("PV1", tests.pv1_volt != null ? `${tests.pv1_volt} V` : "-", { mono: true })}
                  {doneRow("PV2", tests.pv2_volt != null ? `${tests.pv2_volt} V` : "-", { mono: true })}
                </div>
              </div>
            </div>
          </DoneSection>
        );
      })()}

      {/* §3.5-§3.8 Function pass/fail — 4 items with ✓/✗ + note per row. */}
      <DoneSection color="emerald" title="ทดสอบฟังก์ชั่น (§3.5-§3.8)">
        <div className="space-y-0.5">
          {(() => {
            const tests = checklist?.function_tests ? (() => {
              try { return JSON.parse(checklist.function_tests) as Record<string, unknown>; } catch { return {}; }
            })() : {};
            return FUNCTION_PASS_FAIL.map(item => {
              const c = (tests[item.key] as PassNote | undefined) || { pass: null };
              return doneRow(item.label, (
                <span className="inline-flex items-center gap-2">
                  {c.pass === true && <span className="text-emerald-700 font-semibold">✓ ผ่าน</span>}
                  {c.pass === false && <span className="text-red-600 font-semibold">✗ ไม่ผ่าน</span>}
                  {c.pass == null && <span className="text-gray-400">-</span>}
                  {c.note && <span className="text-gray-500 italic text-xs">· {c.note}</span>}
                </span>
              ));
            });
          })()}
        </div>
      </DoneSection>

      {/* Aggregate + notes. Kept AFTER the details so reviewers see the
          full breakdown first, then the summary + free-text at the tail. */}
      <DoneSection color="gray" title="สรุป · บันทึกเพิ่มเติม">
        <div className="space-y-0.5">
          {doneRow(
            "งานติดตั้งระบบ (§2)",
            visualStats.total > 0 ? (
              <>
                <span className="text-emerald-700 font-semibold">✓ {visualStats.passed}</span>
                {visualStats.failed > 0 && <> · <span className="text-red-600 font-semibold">✗ {visualStats.failed}</span></>}
                <span className="text-gray-400"> / {visualStats.total}</span>
              </>
            ) : "-"
          )}
          {doneRow(
            "ทดสอบฟังก์ชั่น (§3)",
            funcStats.total > 0 ? (
              <>
                <span className="text-emerald-700 font-semibold">✓ {funcStats.passed}</span>
                {funcStats.failed > 0 && <> · <span className="text-red-600 font-semibold">✗ {funcStats.failed}</span></>}
                <span className="text-gray-400"> / {funcStats.total}</span>
              </>
            ) : "-"
          )}
          {doneRow("บันทึกเพิ่มเติม", checklist?.notes ? <span className="whitespace-pre-wrap">{checklist.notes}</span> : "-")}
        </div>
      </DoneSection>

      {/* Photos — merged install_photos + install_photos_extra. Small
          thumbnails (~64px) so 6-8 fit per row; click any to open the
          gallery viewer full-size. */}
      {allPhotos.length > 0 && (
        <DoneSection color="emerald" title={`ภาพส่งมอบ (${allPhotos.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {allPhotos.map((url, i) => (
              <FallbackImage
                key={i}
                src={url}
                alt=""
                className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition cursor-pointer"
                gallery={allPhotos.map((u, idx) => ({ url: u, label: `ภาพส่งมอบ ${idx + 1} / ${allPhotos.length}` }))}
                galleryIndex={i}
              />
            ))}
          </div>
        </DoneSection>
      )}

      {lead.install_note && (
        <DoneSection color="gray" title="บันทึกการส่งมอบ">
          <div className="text-gray-800 whitespace-pre-wrap">{lead.install_note}</div>
        </DoneSection>
      )}

      {/* Cost summary — applies VIP / promo discount before installment split so
         the totals match Order step and the receipt. */}
      <DoneSection color="blue" title="สรุปค่าใช้จ่าย">
        {(() => {
          const effTotal = Math.max(0, orderTotal - orderDiscount);
          const extra = lead.install_extra_cost || 0;
          return (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">มูลค่างาน (ใบเสนอราคา)</span>
                <span className="font-mono text-gray-800">{fmt(orderTotal)} ฿</span>
              </div>
              {orderDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    หักส่วนลด{lead.order_discount_pct ? ` ${lead.order_discount_pct}%` : ""}
                    {lead.order_discount_note ? ` · ${lead.order_discount_note}` : ""}
                  </span>
                  <span className="font-mono text-gray-800">-{fmt(orderDiscount)} ฿</span>
                </div>
              )}
              {lead.pre_total_price ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ค่าสำรวจ</span>
                  <span className="font-mono text-gray-800">{fmt(lead.pre_total_price)} ฿</span>
                </div>
              ) : null}
              {pctBefore < 100 ? (() => {
                const dep = lead.pre_total_price || 0;
                const beforeAmt = Math.round(effTotal * pctBefore / 100);
                const afterAmt = effTotal - beforeAmt;
                const credAfter = Math.min(afterAmt, dep);
                const credBefore = Math.min(beforeAmt, dep - credAfter);
                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">งวด 1/2 (ก่อนติดตั้ง {pctBefore}%)</span>
                      <span className="font-mono text-gray-800">{fmt(beforeAmt - credBefore)} ฿</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">งวด 2/2 (หลังติดตั้ง)</span>
                      <span className="font-mono text-gray-800">{fmt(afterAmt - credAfter)} ฿</span>
                    </div>
                  </>
                );
              })() : (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ชำระเต็มจำนวน</span>
                  <span className="font-mono text-gray-800">{fmt(Math.max(0, effTotal - (lead.pre_total_price || 0)))} ฿</span>
                </div>
              )}
              {extra > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{lead.install_extra_note || "ค่าใช้จ่ายเพิ่มเติม"}</span>
                  <span className="font-mono text-gray-800">+{fmt(extra)} ฿</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t-2 border-gray-300 pt-2 mt-1">
                <span className="text-gray-900">มูลค่างานรวม</span>
                <span className="font-mono text-emerald-700">{fmt(effTotal + extra)} ฿</span>
              </div>
            </div>
          );
        })()}
      </DoneSection>

      {/* Slip */}
      {lead.order_after_slip && (
        <DoneSection color="violet" title="สลิปหลังติดตั้ง">
          <PaymentSlipsThumbs slipUrl={lead.order_after_slip} label="สลิปหลังติดตั้ง" />
        </DoneSection>
      )}


      {/* Customer signature */}
      {lead.install_customer_signature_url && (
        <DoneSection color="emerald" title="ลายเซ็นลูกค้า (รับงาน)">
          <a href={lead.install_customer_signature_url} onClick={fileViewer.handler(lead.install_customer_signature_url, "ลายเซ็นลูกค้า")}>
            <FallbackImage src={lead.install_customer_signature_url} alt="ลายเซ็น" className="max-h-40 max-w-full object-contain bg-white rounded-lg border border-gray-200 hover:opacity-80 transition" />
          </a>
        </DoneSection>
      )}

      {/* Review */}
      {lead.review_rating ? (
        <DoneSection color="amber" title="คะแนนจากลูกค้า">
          <div className="space-y-1.5">
            {[
              { label: "คุณภาพงาน", value: lead.review_quality },
              { label: "การบริการ", value: lead.review_service },
              { label: "ตรงต่อเวลา", value: lead.review_punctuality },
            ].filter(r => r.value).map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-gray-500 text-xs">{r.label}</span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`text-sm ${s <= r.value! ? "text-amber-400" : "text-gray-200"}`}>★</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {lead.review_comment && <div className="text-gray-600 mt-2 text-xs italic">&quot;{lead.review_comment}&quot;</div>}
        </DoneSection>
      ) : lead.review_sent ? (
        <div className="text-xs text-gray-400 italic">ส่งแบบประเมินแล้ว — รอลูกค้าให้คะแนน</div>
      ) : null}

      {/* Install-doc download removed — "ใบส่งมอบ" button lives in the doneHeader now. */}
    </>
    );
  };

  if (rescheduling) {
    return (
      <AppointmentRescheduler
        title="เลื่อนนัดติดตั้ง"
        currentDate={lead.install_date}
        showTimeSlot={false}
        excludeLeadId={lead.id}
        teamContext="install"
        onCancel={() => setRescheduling(false)}
        onSave={saveReschedule}
      />
    );
  }

  return (
    <StepLayout
      state={state}
      subSteps={SUB_STEPS}
      subStep={subStep}
      onSubStepChange={(n) => {
        if (n > subStep) {
          // Same gates as the "ถัดไป" button — keep them in sync.
          // Missing-field labels are pushed in top→bottom render order so the
          // error message reads the same way the user sees the form.
          if (subStep === 1) {
            const missing: string[] = [];
            if (photos.length === 0) missing.push("รูปภาพการติดตั้ง");
            if (!note.trim()) missing.push("บันทึกการส่งมอบ");
            if (missing.length > 0) { setNextError(missing.join(", ")); return; }
          }
          if (subStep === 2 && extraCost > 0 && !extraNote.trim()) {
            setNextError("กรุณากรอกรายละเอียดค่าใช้จ่ายเพิ่มเติม");
            return;
          }
          if (subStep === 3 && !collectPaymentReady) {
            setNextError("ต้องยืนยันรับชำระหรือรับเช็คของงวดหลังติดตั้งและค่าใช้จ่ายเพิ่มเติมก่อนถึงจะส่งมอบงานได้");
            return;
          }
        }
        setNextError(null);
        setSubStep(n);
      }}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={
        <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
          <span className="text-sm font-semibold text-emerald-700 md:flex-1 md:truncate">ติดตั้งเสร็จสิ้น{lead.install_actual_date ? ` · ${formatDate(lead.install_actual_date)}` : lead.install_completed_at ? ` · ${formatDate(lead.install_completed_at)}` : ""}</span>
          {/* ใบส่งมอบงานติดตั้ง — compact PDF button matching the doc-button
              pattern used across the other done-step headers. */}
          <button
            type="button"
            onClick={openInstallDoc}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
          >
            <DocumentIcon className="w-4 h-4" strokeWidth={2} />
            ใบส่งมอบ
          </button>
          <div className="md:mr-4">
            <InstallmentReceiptList
              leadId={lead.id}
              preDocNo={lead.pre_doc_no}
              when="after"
              refresh={refresh}
              installments={(() => {
                try { return lead.order_installments ? JSON.parse(lead.order_installments) : []; }
                catch { return []; }
              })()}
              compact
            />
          </div>
        </div>
      }
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
    >
      {/* Step 0: นัด — appointment confirmation */}
      {subStep === 0 && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${lead.install_confirmed ? "bg-emerald-50 border-emerald-600/15" : "bg-active-light border-active/20"}`}>
            <svg className={`w-4 h-4 shrink-0 ${lead.install_confirmed ? "text-emerald-600" : "text-active"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
            </svg>
            <div className="flex-1 flex items-baseline gap-1.5 flex-wrap min-w-0">
              <span className={`text-xs font-semibold tracking-wider uppercase ${lead.install_confirmed ? "text-emerald-700/70" : "text-active/70"}`}>
                {lead.install_confirmed ? "ยืนยันแล้ว" : "นัดหมายแล้ว"}
              </span>
              {lead.install_date ? (
                <span className={`text-sm font-bold ${lead.install_confirmed ? "text-emerald-900" : "text-active"}`}>
                  {formatDate(lead.install_date)}
                  {lead.install_date_end && lead.install_date_end !== lead.install_date && (
                    <span> – {formatDate(lead.install_date_end)}</span>
                  )}
                </span>
              ) : (
                <span className="text-sm text-gray-500 italic">ยังไม่ได้นัด</span>
              )}
            </div>
            <button type="button" onClick={() => setRescheduling(true)} className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border transition-colors ${lead.install_confirmed ? "border-emerald-600/20 text-emerald-700 hover:bg-emerald-100" : "border-active/30 text-active hover:bg-active/10"}`}>
              {lead.install_date ? "Reschedule" : "เลือกวัน"}
            </button>
          </div>
          {/* Optional end date for multi-day installs. Hidden until a start
              date is picked; clearing the field stores NULL (single-day). */}
          {lead.install_date && (
            <div className="flex items-center gap-2 text-xs text-gray-600 px-1">
              <label className="font-semibold uppercase tracking-wider shrink-0">วันสุดท้าย</label>
              <input
                type="date"
                value={lead.install_date_end ? String(lead.install_date_end).slice(0, 10) : ""}
                min={String(lead.install_date).slice(0, 10)}
                onChange={async (e) => {
                  const v = e.target.value || null;
                  await apiFetch(`/api/leads/${lead.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ install_date_end: v }),
                  });
                  refresh();
                }}
                className="h-8 px-2 rounded-md border border-gray-200 bg-white text-xs focus:outline-none focus:border-primary"
              />
              <span className="text-gray-400">ติดตั้งหลายวัน — เว้นว่างถ้าเป็นวันเดียว</span>
            </div>
          )}
          {!lead.install_confirmed && lead.install_date && (
            <div className="space-y-2">
              {lead.line_id && (
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyLine}
                    onChange={(e) => setNotifyLine(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>ส่งยืนยันนัดติดตั้งทาง LINE</span>
                </label>
              )}
              <button onClick={confirmAppointment} disabled={saving}
                className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
                {saving ? "..." : "ยืนยันนัดติดตั้ง"}
              </button>
            </div>
          )}
          {lead.install_confirmed && lead.line_id && (
            <button
              type="button"
              onClick={resendInstallLine}
              disabled={resending}
              className={`w-full h-8 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                resendResult === "ok" ? "bg-emerald-500 text-white"
                : resendResult === "err" ? "bg-red-500 text-white"
                : "text-gray-700 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {resending ? "กำลังส่ง…"
                : resendResult === "ok" ? "✓ ส่งแล้ว"
                : resendResult === "err" ? "ส่งไม่สำเร็จ"
                : "ส่งยืนยันทาง LINE อีกครั้ง"}
            </button>
          )}
          {checklistUrl && (() => {
            // Per-customer download filename — `download` attribute is honored
            // because /api/files/* is same-origin and sets no Content-Disposition.
            const safe = (lead.full_name || `lead_${lead.id}`).replace(/[\\/:*?"<>|]/g, "_").trim();
            const downloadName = `เอกสารขอขนานไฟ_${safe}.pdf`;
            return (
              <a
                href={checklistUrl}
                onClick={fileViewer.handler(checklistUrl, downloadName)}
                className="w-full h-8 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <DocumentIcon className="w-4 h-4 text-red-500" strokeWidth={2} />
                ดาวน์โหลด checklist เอกสารขอขนานไฟ
              </a>
            );
          })()}
        </div>
      )}

      {/* Step 1: ส่งมอบ */}
      {subStep === 1 && (
        <div className="space-y-3">
          {/* Install handover checklist — top of the รูปภาพ sub-step.
              Surveyor fills the inspection form first, then attaches photo
              evidence below. */}
          <InstallChecklist lead={lead as unknown as Record<string, unknown>} leadId={lead.id} />
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-500 block mb-2 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0"><CameraIcon className="w-4 h-4" /></span>
              HANDOVER PHOTOS <span className="text-red-500">*</span>
            </label>
            {/* Single drop zone wraps the thumbs and an inline add-tile.
                Dragging into the bordered area drops files; the add-tile is the
                click target for the file picker. Same input handler in both. */}
            {/* Single drop zone. Empty → centered prompt fills the box; filled
                → grid with a compact "+" tile at the end. Drop anywhere uploads. */}
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!dragActive) setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={async (e) => {
                e.preventDefault(); e.stopPropagation();
                setDragActive(false);
                const dropped = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith("image/"));
                if (dropped.length) await uploadPhotos(dropped);
              }}
              className={`rounded-lg border-2 border-dashed transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-gray-300"}`}
            >
              {photos.length === 0 ? (
                <label className={`flex flex-col items-center justify-center gap-2 px-4 py-12 min-h-[160px] cursor-pointer transition-colors ${dragActive ? "text-primary" : "text-gray-500 hover:text-primary"}`}>
                  {uploading ? (
                    <div className="w-8 h-8 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-10 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                      <span className="text-sm font-semibold">
                        {dragActive ? "ปล่อยเพื่ออัพโหลด" : "ลากรูปมาวาง หรือคลิกเพื่อเลือก"}
                      </span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                    const input = e.target;
                    if (!input.files?.length) return;
                    await uploadPhotos(Array.from(input.files));
                    input.value = "";
                  }} />
                </label>
              ) : (
                <div className="p-3 grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {photos.map((url, i) => (
                    <div key={i} className="relative">
                      <FallbackImage
                        src={url}
                        alt=""
                        className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                        gallery={photos.map((u, idx) => ({ url: u, label: `รูปติดตั้ง ${idx + 1} / ${photos.length}` }))}
                        galleryIndex={i}
                      />
                      <button onClick={(e) => { e.stopPropagation(); removePhoto(i); }} className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full text-white flex items-center justify-center text-xs z-10" style={{ minHeight: 0 }}>✕</button>
                    </div>
                  ))}
                  <label className={`relative aspect-square flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors ${dragActive ? "border-primary text-primary" : "border-gray-300 text-gray-400 hover:border-primary hover:text-primary"}`} title="เพิ่มรูป">
                    {uploading ? (
                      <div className="w-6 h-6 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : (
                      <PlusIcon className="w-8 h-8" strokeWidth={1.5} />
                    )}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                      const input = e.target;
                      if (!input.files?.length) return;
                      await uploadPhotos(Array.from(input.files));
                      input.value = "";
                    }} />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">บันทึกการส่งมอบ <span className="text-red-500">*</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={() => flushSave()} rows={3} placeholder="หมายเหตุ, รายละเอียดการติดตั้ง..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
          </div>

        </div>
      )}

      {/* Step 2: สรุปค่าใช้จ่าย */}
      {subStep === 2 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">สรุปค่าใช้จ่าย</div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดตามใบเสนอราคา</span>
              <span className="font-bold font-mono text-gray-900">{fmt(orderTotal)} บาท</span>
            </div>
            {orderDiscount > 0 && (
              <div className="flex justify-between text-xs text-rose-600">
                <span>หักส่วนลด{lead.order_discount_note ? ` (${lead.order_discount_note})` : ""}</span>
                <span className="font-mono">-{fmt(orderDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-emerald-600">
              <span>ชำระแล้ว</span>
              <span className="font-mono">-{fmt(paidAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500 border-t border-gray-200 pt-1.5">
              <span>ยอดที่ต้องจ่าย</span>
              <span className="font-mono">{fmt(Math.max(0, orderTotal - orderDiscount - paidAmount))}</span>
            </div>
            {depositPaid > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(depositPaid)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1.5">
              <span className="text-gray-700">ยอดคงค้าง</span>
              <span className={`font-bold font-mono ${remainingAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {fmt(remainingAmount)} บาท
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ค่าใช้จ่ายเพิ่มเติม (บาท)</label>
            <input type="number" min="0" inputMode="numeric" value={extraCost || ""} onChange={e => setExtraCost(Math.max(0, parseFloat(e.target.value) || 0))} onBlur={() => flushSave()} placeholder="0"
              className="w-full h-12 px-3 rounded-lg border border-gray-200 text-lg font-bold font-mono focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">รายละเอียด {extraCost > 0 && <span className="text-red-500">*</span>}</label>
            <textarea value={extraNote} onChange={e => setExtraNote(e.target.value)} onBlur={() => flushSave()} rows={2} placeholder="เช่น ค่าวัสดุเพิ่มเติม, ค่าแรงพิเศษ..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
          </div>

          {/* ยอดรวมที่ต้องเก็บ */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-amber-700">ยอดรวมที่ต้องเก็บ</span>
              <span className="text-lg font-bold font-mono text-amber-700">{fmt(legacyBalanceToCollect + afterInstallmentToCollect + extraOutstanding)} บาท</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: เก็บเงินคงค้าง / ค่าใช้จ่ายเพิ่มเติม */}
      {subStep === 3 && (() => {
        // PaymentSection allocates a stable intent as soon as it mounts. Wait
        // for canonical rows first so a brief empty client state cannot create
        // a fresh draft after the same key was already confirmed.
        if (!paymentStateLoaded) {
          return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-center text-sm text-gray-500">
              กำลังตรวจสอบรายการชำระเงิน...
            </div>
          );
        }
        const extraLabel = extraCost > 0
          ? (extraNote ? `ค่าใช้จ่ายเพิ่มเติม · ${extraNote}` : "ค่าใช้จ่ายเพิ่มเติม")
          : "";
        const renderChequePending = (payment: InstallPaymentRow, title: string) => (
          <div
            data-install-cheque-confirm={payment.id}
            className={`mt-3 rounded-lg border px-3 py-3 ${focusedAfterChequeId === payment.id ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200" : "border-amber-200 bg-amber-50"}`}
          >
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-amber-900">{title} · รับเช็คแล้ว · รอรับเงิน</div>
                <div className="text-xs text-amber-700 mt-0.5">
                  รับเช็คเมื่อ {formatDate(payment.cheque_received_at)} · ยอด {fmt(payment.amount)} บาท
                </div>
              </div>
              {canConfirmChequeMoney ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={confirmingAfterChequeId === payment.id}
                    onClick={() => confirmAfterChequeMoney(payment)}
                    className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {confirmingAfterChequeId === payment.id ? "กำลังยืนยัน..." : "ยืนยันรับเงิน"}
                  </button>
                  <button
                    type="button"
                    disabled={confirmingAfterChequeId === payment.id || rejectingCheque}
                    onClick={() => { setRejectChequeReason(""); setRejectingChequePayment(payment); }}
                    className="w-full h-8 rounded-lg text-sm font-semibold text-red-600 border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    ✗ ไม่อนุมัติ / ส่งกลับให้ upload ใหม่
                  </button>
                </div>
              ) : (
                <span className="text-xs font-semibold text-amber-700">รอฝ่ายบัญชียืนยันรับเงิน</span>
              )}
            </div>
          </div>
        );
        const combinedAfterAmount = combinedAfterInstallment
          ? ((combinedAfterInstallment.payment?.description || "").includes(COMBINED_EXTRA_MARKER)
              ? Number(combinedAfterInstallment.payment?.amount || 0)
              : combinedAfterInstallment.amount + extraOutstanding)
          : 0;
        const combinedAfterExtraAmount = combinedAfterInstallment
          ? ((combinedAfterInstallment.payment?.description || "").includes(COMBINED_EXTRA_MARKER)
              ? (parseCombinedPaymentAllocation(combinedAfterInstallment.payment?.description)?.extra
                ?? Math.max(0, Number(combinedAfterInstallment.payment?.amount || 0) - combinedAfterInstallment.amount))
              : extraOutstanding)
          : 0;
        const legacyCollectionAmount = existingLegacyCombinedRow
          ? Number(existingLegacyCombinedRow.amount || 0)
          : (legacyCombinedCreationActive ? remainingAmount + extraOutstanding : remainingAmount);
        const legacyExtraDisplayAmount = existingLegacyCombinedRow
          ? (parseCombinedPaymentAllocation(existingLegacyCombinedRow.description)?.extra
            ?? Math.max(0, Number(existingLegacyCombinedRow.amount || 0) - remainingAmount))
          : extraOutstanding;
        return (
          <div className="space-y-3">
            {combinedAfterInstallment && (() => {
              const { plan, index, payment, amount, ready } = combinedAfterInstallment;
              const title = `งวดที่ ${index + 1} + ค่าใช้จ่ายเพิ่มเติม`;
              return (
                <div className="rounded-lg bg-white border border-amber-300 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-xs font-bold text-amber-700 uppercase">ชำระรวมครั้งเดียว</span>
                      <div className="text-[11px] text-gray-500 mt-0.5">งวดสุดท้ายหลังติดตั้งและค่าใช้จ่ายเพิ่มเติม</div>
                    </div>
                    <span className="text-lg font-bold font-mono tabular-nums text-amber-700">{fmt(combinedAfterAmount)} บาท</span>
                  </div>
                  <PaymentSection
                    paymentTitle={title}
                    amountLabel="ยอดรวม"
                    amount={combinedAfterAmount}
                    leadId={lead.id}
                    leadName={lead.full_name}
                    lineId={lead.line_id}
                    slipUrl={payment && (payment.confirmed_at || payment.cheque_received_at) ? `/api/payments/${payment.id}` : null}
                    slipField={`order_installment_${index}`}
                    paymentNote={`ค่าระบบ Solar Rooftop · งวดที่ ${index + 1} หลังติดตั้ง + ค่าใช้จ่ายเพิ่มเติม`}
                    stepNo={10 + index}
                    description={combinedPaymentDescription(`งวดที่ ${index + 1} · ชำระหลังติดตั้ง`, amount, combinedAfterExtraAmount)}
                    docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-${index + 1}` : null}
                    confirmed={ready}
                    allowCheque
                    onlyOther={plan.method === "loan"}
                    initialOtherMethod={plan.method === "loan" ? `สินเชื่อ${plan.loan_bank ? ` · ${plan.loan_bank}` : ""}` : undefined}
                    confirmLabel={plan.method === "cheque" ? "ยืนยันรับเช็ค" : undefined}
                    onConfirmed={onExtraConfirmed}
                    onUndone={onExtraConfirmed}
                    onVerified={() => setAfterSlipDone(true)}
                    paymentMethod={payment?.payment_method ?? plan.method ?? "transfer"}
                    ccSurchargePct={plan.method === "cc" ? plan.cc_pct ?? null : null}
                    ccSurchargeAmount={plan.method === "cc" && plan.cc_pct ? Math.round(combinedAfterAmount * plan.cc_pct / 100) : null}
                    details={[
                      { label: `งวดที่ ${index + 1} หลังติดตั้ง`, value: `฿${fmt(amount)}` },
                      { label: extraNote || "ค่าใช้จ่ายเพิ่มเติม", value: `฿${fmt(combinedAfterExtraAmount)}` },
                    ]}
                  />
                  {combinedAfterChequePending && renderChequePending(combinedAfterChequePending, title)}
                </div>
              );
            })()}

            {afterInstallmentStates.filter(item => item.index !== combinedAfterInstallment?.index).map(({ plan, index, payment, amount, ready }) => {
              const chequePending = payment?.payment_method === "cheque" && payment.cheque_received_at && !payment.confirmed_at
                ? payment
                : null;
              const title = `งวดที่ ${index + 1} · ชำระหลังติดตั้ง`;
              return (
                <div key={`after-installment-${index}`} className="rounded-lg bg-white border border-violet-200 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-xs font-bold text-violet-700 uppercase">{title}</span>
                      {payment?.confirmed_at && <div className="text-[11px] text-emerald-600 mt-0.5">ยืนยันรับเงินแล้ว</div>}
                    </div>
                    <span className="text-lg font-bold font-mono tabular-nums text-violet-700">{fmt(amount)} บาท</span>
                  </div>
                  <PaymentSection
                    paymentTitle={title}
                    amountLabel={`งวดที่ ${index + 1}/${plannedInstallments.length}`}
                    amount={amount}
                    leadId={lead.id}
                    leadName={lead.full_name}
                    lineId={lead.line_id}
                    slipUrl={payment && (payment.confirmed_at || payment.cheque_received_at) ? `/api/payments/${payment.id}` : null}
                    slipField={`order_installment_${index}`}
                    paymentNote={`ค่าระบบ Solar Rooftop · งวดที่ ${index + 1} · หลังติดตั้ง`}
                    stepNo={10 + index}
                    description={`งวดที่ ${index + 1} · ชำระหลังติดตั้ง`}
                    docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-${index + 1}` : null}
                    confirmed={ready}
                    allowCheque
                    onlyOther={plan.method === "loan"}
                    initialOtherMethod={plan.method === "loan" ? `สินเชื่อ${plan.loan_bank ? ` · ${plan.loan_bank}` : ""}` : undefined}
                    confirmLabel={plan.method === "cheque" ? "ยืนยันรับเช็ค" : undefined}
                    onConfirmed={onExtraConfirmed}
                    onUndone={onExtraConfirmed}
                    onVerified={() => setAfterSlipDone(true)}
                    paymentMethod={payment?.payment_method ?? plan.method ?? "transfer"}
                    ccSurchargePct={plan.method === "cc" ? plan.cc_pct ?? null : null}
                    ccSurchargeAmount={plan.method === "cc" && plan.cc_pct ? Math.round(amount * plan.cc_pct / 100) : null}
                    details={[{ label: `งวดที่ ${index + 1} หลังติดตั้ง`, value: `฿${fmt(amount)}` }]}
                  />
                  {chequePending && renderChequePending(chequePending, title)}
                </div>
              );
            })}

            {!hasStructuredAfterInstallments && remainingAmount > 0 && (
              <div className="rounded-lg bg-white border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className={`text-xs font-bold uppercase ${legacyCombinedDisplay ? "text-amber-700" : "text-gray-400"}`}>
                      {legacyCombinedDisplay ? "ชำระรวมครั้งเดียว" : "ยอดคงค้างเดิม"}
                    </span>
                    {legacyCombinedDisplay && <div className="text-[11px] text-gray-500 mt-0.5">ยอดคงค้างและค่าใช้จ่ายเพิ่มเติม</div>}
                  </div>
                  <span className={`text-lg font-bold font-mono tabular-nums ${legacyCombinedDisplay ? "text-amber-700" : "text-gray-900"}`}>{fmt(legacyCollectionAmount)} บาท</span>
                </div>
                <PaymentSection
                  paymentTitle={legacyCombinedDisplay ? "ยอดคงค้าง + ค่าใช้จ่ายเพิ่มเติม" : "ยอดคงค้าง"}
                  amountLabel={legacyCombinedDisplay ? "ยอดรวม" : ""}
                  amount={legacyCollectionAmount}
                  leadId={lead.id}
                  leadName={lead.full_name}
                  lineId={lead.line_id}
                  slipUrl={lead.order_after_slip || afterChequePaymentUrl}
                  slipField="order_after_slip"
                  stepNo={99}
                  description={legacyCombinedDisplay
                    ? combinedPaymentDescription("ยอดคงค้างหลังติดตั้ง", remainingAmount, legacyExtraDisplayAmount)
                    : "ยอดคงค้างหลังติดตั้ง"}
                  docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-99` : null}
                  confirmed={afterPaymentReady}
                  allowCheque
                  onConfirmed={onAfterConfirmed}
                  onUndone={refresh}
                  onVerified={() => setAfterSlipDone(true)}
                  paymentMethod={pendingAfterRow?.payment_method ?? null}
                  details={[
                    { label: "ยอดคงค้าง", value: `฿${fmt(remainingAmount)}` },
                    ...(legacyCombinedDisplay ? [{ label: extraNote || "ค่าใช้จ่ายเพิ่มเติม", value: `฿${fmt(legacyExtraDisplayAmount)}` }] : []),
                  ]}
                />
                {afterChequePending && renderChequePending(afterChequePending, legacyCombinedDisplay ? "ยอดคงค้าง + ค่าใช้จ่ายเพิ่มเติม" : "ยอดคงค้าง")}
              </div>
            )}

            {extraOutstanding > 0
              && !(combinedAfterInstallment && !combinedAfterInstallment.payment?.confirmed_at)
              && !legacyCombinedBlocksExtra && (
              <div className="rounded-lg bg-white border border-amber-200 p-3">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xs font-bold text-amber-700 uppercase">ค่าใช้จ่ายเพิ่มเติม</span>
                    {confirmedExtraTotal > 0 && <div className="text-[11px] text-gray-500 mt-0.5">ชำระแล้ว {fmt(confirmedExtraTotal)} บาท · คงเหลือรอบนี้</div>}
                  </div>
                  <span className="text-lg font-bold font-mono tabular-nums text-amber-700">{fmt(extraOutstanding)} บาท</span>
                </div>
                <PaymentSection
                  paymentTitle={extraLabel || "ค่าใช้จ่ายเพิ่มเติม"}
                  amountLabel=""
                  amount={extraOutstanding}
                  leadId={lead.id}
                  leadName={lead.full_name}
                  lineId={lead.line_id}
                  slipUrl={extraChequePending ? `/api/payments/${extraChequePending.id}` : null}
                  slipField={extraSlipField}
                  stepNo={extraStepNo}
                  description={extraLabel || "ค่าใช้จ่ายเพิ่มเติม"}
                  docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-EX${extraStepNo - 99}` : null}
                  confirmed={!!extraChequePending}
                  allowCheque
                  onConfirmed={onExtraConfirmed}
                  onUndone={onExtraConfirmed}
                  onVerified={() => setAfterSlipDone(true)}
                  paymentMethod={pendingExtraRow?.payment_method ?? null}
                  details={[
                    { label: extraNote || "ค่าใช้จ่ายเพิ่มเติม", value: `฿${fmt(extraOutstanding)}` },
                  ]}
                />
                {extraChequePending && renderChequePending(extraChequePending, "ค่าใช้จ่ายเพิ่มเติม")}
              </div>
            )}

            {legacyBalanceToCollect <= 0 && afterInstallmentOutstanding <= 0 && extraOutstanding <= 0 && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
                <CheckIcon className="w-5 h-5 text-emerald-600 shrink-0" strokeWidth={2.5} />
                <div>
                  <div className="text-sm font-semibold text-emerald-700">ไม่มียอดต้องเก็บเพิ่ม</div>
                  <div className="text-xs text-emerald-600 mt-0.5">ลูกค้าชำระยอดคงค้างและค่าใช้จ่ายเพิ่มเติมครบแล้ว</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Step 4: ลงนามรับงาน */}
      {subStep === 4 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0"><UserIcon className="w-4 h-4" /></span>
            CUSTOMER SIGNATURE
          </div>

          <SignaturePad
            leadId={lead.id}
            fieldName="install_customer_signature_url"
            initialUrl={lead.install_customer_signature_url}
            onSaved={(url) => setSignatureUrl(url)}
          />

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1.5">วันที่ติดตั้งจริง</label>
            <input type="date" value={actualDate} onChange={e => setActualDate(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary" />
          </div>

          {/* View inspection document — same UX as Warranty's "ใบรับประกัน":
              mobile pops the in-app PdfPreview modal, desktop opens the PDF
              in a new tab (native PDF viewer is better for multi-page docs). */}
          <button
            type="button"
            onClick={() => {
              if (isMobile) setInstallDocPreviewOpen(true);
              else window.open(me?.id ? `/api/install-doc/${lead.id}?user_id=${me.id}` : `/api/install-doc/${lead.id}`, "_blank", "noreferrer");
            }}
            className="flex items-center justify-center gap-2 w-full h-11 rounded-lg bg-primary hover:bg-primary-dark text-sm font-semibold text-white transition-colors"
          >
            <DocumentIcon className="w-4 h-4" strokeWidth={2} />
            เอกสารตรวจสอบงานติดตั้ง
          </button>

        </div>
      )}

      {/* Navigation buttons — show whenever user is past the appointment
          sub-step. Was gated on `install_confirmed`, which stranded the user
          with no Back button after a reschedule (saveReschedule resets the
          flag but the persisted subStep stays at 1+). The earlier sub-step
          has its own "ยืนยันนัดติดตั้ง" button so navigation isn't needed there. */}
      {subStep > 0 && subStep < 4 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          {subStep > 0 ? (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
              ย้อนกลับ
            </button>
          ) : <span className="hidden md:block md:w-64" />}
          <button type="button" onClick={async () => {
            if (subStep === 1) {
              const missing: string[] = [];
              if (photos.length === 0) missing.push("รูปภาพการติดตั้ง");
              if (!note.trim()) missing.push("บันทึกการส่งมอบ");
              if (missing.length > 0) { setNextError(missing.join(", ")); return; }
            }
            if (subStep === 2 && extraCost > 0 && !extraNote.trim()) {
              setNextError("กรุณากรอกรายละเอียดค่าใช้จ่ายเพิ่มเติม");
              return;
            }
            if (subStep === 3 && !collectPaymentReady) {
              setNextError("ต้องยืนยันรับชำระหรือรับเช็คของงวดหลังติดตั้งและค่าใช้จ่ายเพิ่มเติมก่อนถึงจะส่งมอบงานได้");
              return;
            }
            await flushSave();
            setNextError(null);
            setSubStep(subStep + 1); scrollToStep();
          }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      )}
      {subStep === 4 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
            ย้อนกลับ
          </button>
          <button
            onClick={() => {
              if (!collectPaymentReady) {
                setNextError("ต้องยืนยันรับชำระหรือรับเช็คของงวดหลังติดตั้งและค่าใช้จ่ายเพิ่มเติมก่อนถึงจะส่งมอบงานได้");
                return;
              }
              closeStep();
            }}
            disabled={saving || !signatureUrl}
            className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? "กำลังยืนยัน..." : "ยืนยันส่งมอบงาน"}
            <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      {installDocPreviewOpen && (
        <InstallDocModal
          leadId={lead.id}
          docNo={lead.install_checklist_doc_no || ""}
          onClose={() => setInstallDocPreviewOpen(false)}
        />
      )}
      {rejectingChequePayment && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => !rejectingCheque && setRejectingChequePayment(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-md w-full p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900">ไม่อนุมัติการรับเช็ค</h3>
            <p className="text-xs text-gray-600 mt-1">รายการจะถูกส่งกลับให้ Sales อัปโหลดหลักฐานใหม่ กรุณาระบุเหตุผล</p>
            <label className="block text-xs font-semibold text-gray-700 mt-4 mb-1">เหตุผล <span className="text-red-500">*</span></label>
            <textarea
              value={rejectChequeReason}
              onChange={(event) => setRejectChequeReason(event.target.value)}
              rows={3}
              autoFocus
              placeholder="เช่น ภาพเช็คไม่ชัด / ยอดเงินไม่ถูกต้อง"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-red-400 resize-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={rejectingCheque}
                onClick={() => setRejectingChequePayment(null)}
                className="h-8 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!rejectChequeReason.trim() || rejectingCheque}
                onClick={rejectReceivedCheque}
                className="h-8 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {rejectingCheque ? "กำลังส่ง…" : "ยืนยันไม่อนุมัติ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </StepLayout>
  );
}
