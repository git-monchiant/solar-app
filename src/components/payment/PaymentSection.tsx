"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import ImageLightbox from "@/components/ui/ImageLightbox";
import PaymentHeader from "./PaymentHeader";
import { buildPaymentFlex } from "@/lib/utils/line-flex";
import { useMe } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";

const MAX_SLIPS = 5;

interface Props {
  paymentTitle: string;
  amountLabel: string;
  amount: number;
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
};

type SlipStatus = "verifying" | "verified" | "failed";
interface SlipEntry {
  key: string;            // stable React key (slip_files id, payment slot, or tmp-<ts>)
  url: string;            // image URL (or data: for local preview)
  status: SlipStatus;
  error?: string;
  slipFilesId?: number;   // staging row id — needed for DELETE /api/slips/:id
  tempFileUrl?: string;   // /api/files/<name> during verify; cleaned after success/fail
  filename?: string;
}

export default function PaymentSection({
  paymentTitle,
  amountLabel,
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
  const [tab, setTab] = useState<"qr" | "link" | "bank">("qr");
  const { me } = useMe();
  const dialog = useDialog();
  const isAdmin = me?.roles?.includes("admin") ?? false;

  const [slips, setSlips] = useState<SlipEntry[]>([]);
  const [slipsLoaded, setSlipsLoaded] = useState(false);
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
          const data = await res.json() as { slots: Array<{ slot: number; url: string; filename: string | null }> };
          if (cancelled) return;
          setSlips(data.slots.map((s) => ({
            key: `slot-${s.slot}`,
            url: s.url,
            status: "verified" as const,
            filename: s.filename ?? undefined,
          })));
        } else {
          const res = await apiFetch(`/api/slips?lead_id=${leadId}&slip_field=${encodeURIComponent(slipField)}`) as { slips: Array<{ id: number; url: string; filename: string | null }> };
          if (cancelled) return;
          const list = res.slips.map((s) => ({
            key: `slip-${s.id}`,
            url: s.url,
            status: "verified" as const,
            slipFilesId: s.id,
            filename: s.filename ?? undefined,
          }));
          setSlips(list);
          if (list.length > 0 && !verifiedFiredRef.current) {
            verifiedFiredRef.current = true;
            onVerified?.(list[0].url);
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
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string>("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [lineSending, setLineSending] = useState<string | null>(null);
  const [lineSent, setLineSent] = useState<string | null>(null);
  const [lineConfirmType, setLineConfirmType] = useState<"qr" | "link" | "bank" | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      const qr = s.promptpay_qr_enabled !== "false";
      const link = s.promptpay_link_enabled !== "false";
      const bank = s.bank_account_enabled !== "false";
      if (!qr && link) setTab("link");
      else if (!qr && !link && bank) setTab("bank");
    }).catch(console.error);
  }, []);

  // Generate PromptPay QR — regen whenever amount changes
  useEffect(() => {
    if (amount <= 0) return;
    setQrLoading(true);
    setQrError(null);
    const params = new URLSearchParams({ amount: String(amount) });
    if (leadId) params.set("lead_id", String(leadId));
    if (stepNo) params.set("step_no", String(stepNo));
    apiFetch(`/api/qr?${params.toString()}`)
      .then((d: { qrDataUrl: string; mode?: "credit_transfer" | "bill_payment" }) => {
        setQrDataUrl(d.qrDataUrl);
        if (d.mode) setQrMode(d.mode);
      })
      .catch((err) => { console.error(err); setQrError("สร้าง QR ไม่สำเร็จ"); })
      .finally(() => setQrLoading(false));
  }, [amount, leadId, stepNo]);

  // Ensure a pay token exists for (lead_id, amount, description, installment) so URLs can hide the amount
  useEffect(() => {
    if (amount <= 0) return;
    apiFetch("/api/pay-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, amount, description: paymentTitle, installment: amountLabel }),
    }).then((r: { token: string }) => setPayToken(r.token)).catch(console.error);
  }, [leadId, amount, paymentTitle, amountLabel]);

  const qrEnabled = settings.promptpay_qr_enabled !== "false";
  const linkEnabled = settings.promptpay_link_enabled !== "false";
  const bankEnabled = settings.bank_account_enabled !== "false";
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
      const qrImageUrl = type === "qr" ? `${origin}/api/qr?amount=${amount}&format=image` : undefined;
      const bankDetails = type === "bank" ? [
        { label: "ธนาคาร", value: `${bankName}${bankBranch ? " · " + bankBranch : ""}` },
        { label: "เลขบัญชี", value: bankNumber },
        { label: "ชื่อบัญชี", value: bankAccountName },
      ] : [];
      const fullDocUrl = effectiveDocUrl ? (effectiveDocUrl.startsWith("http") ? effectiveDocUrl : `${origin}${effectiveDocUrl}`) : "";
      const messages = [buildPaymentFlex({
        origin,
        title: paymentTitle,
        amount,
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

    let tmpUrl: string | null = null;
    try {
      // 1. Upload temp copy to disk so Gemini can fetch it by URL
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("lead_id", String(leadId));
      uploadForm.append("type", `slip_step${stepNo ?? 0}`);
      const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() }, body: uploadForm });
      const uploadJson = await uploadRes.json();
      tmpUrl = uploadJson.url as string;
      log("upload_tmp_ok", { tmp_url: tmpUrl });

      // 2. Verify with Gemini
      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
        body: JSON.stringify({ imageUrl: tmpUrl }),
      });
      const slipData = await verifyRes.json();

      if (!slipData.is_slip) {
        log("verify_fail", { tmp_url: tmpUrl, expected_amount: amount, gemini: slipData });
        setSlips((prev) => prev.map((s) => s.key === tempKey ? { ...s, status: "failed" as const, error: "ไม่ใช่สลิปโอนเงิน", tempFileUrl: tmpUrl ?? undefined } : s));
        return;
      }
      log("verify_success", { tmp_url: tmpUrl, expected_amount: amount, gemini: slipData });

      // 3. Persist to staging (slip_files)
      const storeForm = new FormData();
      storeForm.append("file", file);
      storeForm.append("lead_id", String(leadId));
      storeForm.append("slip_field", slipField);
      const storeRes = await apiFetch("/api/slips", { method: "POST", body: storeForm }) as { id: number; url: string };

      // 4. Cleanup temp disk file
      if (tmpUrl) {
        fetch(`/api/upload?file=${encodeURIComponent(tmpUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() } }).catch(() => {});
      }

      log("slip_saved", { db_url: storeRes.url });
      setSlips((prev) => prev.map((s) => s.key === tempKey
        ? { key: `slip-${storeRes.id}`, url: storeRes.url, status: "verified" as const, slipFilesId: storeRes.id, filename: file.name }
        : s));

      if (!verifiedFiredRef.current) {
        verifiedFiredRef.current = true;
        onVerified?.(storeRes.url);
      }
    } catch (e) {
      console.error("addSlip failed:", e);
      setSlips((prev) => prev.map((s) => s.key === tempKey ? { ...s, status: "failed" as const, error: "ตรวจสลิปไม่สำเร็จ", tempFileUrl: tmpUrl ?? undefined } : s));
    }
  };

  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    addSlip(file);
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
  const canConfirm = !confirmed && verifiedCount > 0 && !anyVerifying;

  const handleConfirm = async () => {
    if (stepNo === undefined || confirming || confirmed || !canConfirm) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await apiFetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          step_no: stepNo,
          slip_field: slipField,
          doc_no: docNo ?? null,
          amount,
          description: description ?? null,
          payment_method: tab === "bank" ? "bank_transfer" : tab,
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

  return (
    <div className="space-y-3">
      <PaymentHeader title={paymentTitle} amount={amount} amountLabel={amountLabel} />

      {/* Tabs (hide if only one enabled) */}
      {[qrEnabled, linkEnabled, bankEnabled].filter(Boolean).length > 1 && (
        <div className="flex border-b border-gray-200 -mx-3 px-3">
          {qrEnabled && (
            <button type="button" onClick={() => setTab("qr")}
              className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${tab === "qr" ? "text-active border-active" : "text-gray-400 border-transparent hover:text-gray-600"}`}>
              Thai QR
            </button>
          )}
          {linkEnabled && (
            <button type="button" onClick={() => setTab("link")}
              className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${tab === "link" ? "text-active border-active" : "text-gray-400 border-transparent hover:text-gray-600"}`}>
              Payment Link
            </button>
          )}
          {bankEnabled && (
            <button type="button" onClick={() => setTab("bank")}
              className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${tab === "bank" ? "text-active border-active" : "text-gray-400 border-transparent hover:text-gray-600"}`}>
              Bank Account
            </button>
          )}
        </div>
      )}

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
                <div className="text-[11px] text-gray-500 font-mono tabular-nums mt-0.5">
                  {qrMode === "bill_payment"
                    ? `Bill Payment · Biller ${settings.promptpay_biller_id || ""}`
                    : `PromptPay Tax ID: ${taxId}`}
                </div>
              </div>
            </div>
          </div>
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
                  className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-active hover:bg-active/10 transition-all cursor-pointer"
                >
                  {bankCopied === "all" ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
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

      {/* Slip upload — up to MAX_SLIPS grid */}
      <div className={confirmed ? "" : "pt-2 border-t border-gray-100"}>
        <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id={slipInputId} disabled={confirmed || !canAddMore} />

        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">
            สลิปโอนเงิน <span className="font-mono tabular-nums">{slips.length}/{MAX_SLIPS}</span>
          </div>
          {!confirmed && verifiedCount > 0 && (
            <div className="text-xs font-semibold text-emerald-700">✓ ตรวจแล้ว {verifiedCount}</div>
          )}
        </div>

        {slips.length === 0 && slipsLoaded && !confirmed && (
          <label htmlFor={slipInputId} className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors">
            กรุณาอัปโหลดสลิปโอนเงิน
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
                  <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold pointer-events-none">✓</div>
                )}
                {s.status === "failed" && (
                  <div className="absolute inset-x-0 bottom-0 bg-red-500/90 text-white text-[10px] font-semibold text-center py-0.5 px-1 truncate pointer-events-none" title={s.error}>{s.error || "ไม่ผ่าน"}</div>
                )}
                {!confirmed && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeSlip(s); }}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white flex items-center justify-center text-xs z-10" style={{ minHeight: 0 }}>✕</button>
                )}
              </div>
            ))}
            {canAddMore && (
              <label htmlFor={slipInputId} className="rounded-lg border-2 border-dashed border-gray-300 aspect-square flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary hover:text-primary transition-colors cursor-pointer">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-wider">เพิ่มสลิป</span>
              </label>
            )}
          </div>
        )}

        {confirmed && (
          <div className="mt-3 space-y-2">
            <div className="w-full h-11 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">✓ ยืนยันการชำระเงินเรียบร้อย</div>
            {isAdmin && slipUrl?.startsWith("/api/payments/") && (
              <button
                type="button"
                disabled={undoing}
                onClick={handleUndo}
                className="w-full h-9 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {undoing ? "กำลังถอย…" : "↺ ถอย payment (admin)"}
              </button>
            )}
          </div>
        )}

        {/* Confirm button — enabled once at least 1 slip verified and none verifying */}
        {stepNo !== undefined && !confirmed && slips.length > 0 && (
          <>
            <button
              type="button"
              disabled={!canConfirm || confirming}
              onClick={handleConfirm}
              className="w-full h-11 mt-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirming ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  กำลังยืนยัน…
                </>
              ) : (
                `${confirmLabel || "ยืนยันรับชำระเงิน"}${verifiedCount > 1 ? ` (${verifiedCount} สลิป)` : ""}`
              )}
            </button>
            {confirmError && (
              <div className="mt-2 text-xs text-red-600 text-center">{confirmError}</div>
            )}
            {anyVerifying && (
              <div className="mt-2 text-xs text-amber-600 text-center">กำลังตรวจสลิป… รอสักครู่</div>
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
    </div>
  );
}
