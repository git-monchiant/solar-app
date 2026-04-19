"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import PaymentHeader from "./PaymentHeader";
import { buildPaymentFlex } from "@/lib/utils/line-flex";

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
   * POSTs to /api/payments to write the transaction row and switch the lead's slip URL
   * to point at the new /api/payments/:id. Parent's onConfirmed is called after for refresh. */
  stepNo?: number;
  description?: string;
  docNo?: string | null;
  /** If true, the confirm button shows a "ยืนยันแล้ว" state and is disabled. */
  confirmed?: boolean;
  onConfirmed?: () => void;
  confirmLabel?: string;
  // Optional public-facing document URL (receipt PDF). If set, LINE flex button links to it
  // instead of the default /pay/<token> payment page.
  docUrl?: string;
}

type Settings = {
  promptpay_qr_enabled?: string;
  promptpay_link_enabled?: string;
  promptpay_tax_id?: string;
  company_name?: string;
  company_short_name?: string;
  bank_account_enabled?: string;
  bank_account_bank?: string;
  bank_account_branch?: string;
  bank_account_number?: string;
  bank_account_name?: string;
};

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
  confirmLabel,
  docUrl,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Fire-and-forget audit log — never blocks user flow.
  const log = (action: string, details?: Record<string, unknown>) => {
    fetch("/api/payment-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({ lead_id: leadId, slip_field: slipField, step_no: stepNo, action, details }),
    }).catch(() => {});
  };
  const handleConfirm = async () => {
    if (stepNo === undefined || confirming || confirmed) return;
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
        }),
      });
      onConfirmed?.();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  };
  const [settings, setSettings] = useState<Settings>({});
  const [tab, setTab] = useState<"qr" | "link" | "bank">("qr");
  const [bankCopied, setBankCopied] = useState<"number" | "name" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string>("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [lineSending, setLineSending] = useState<string | null>(null);
  const [lineSent, setLineSent] = useState<string | null>(null);
  const [lineConfirmType, setLineConfirmType] = useState<"qr" | "link" | "bank" | null>(null);

  // Slip upload + Gemini verify.
  // Initial state prefers the prop from parent (lead.pre_slip_url), but falls back to a
  // per-(lead, field) cache in localStorage. This self-heals the case where the user
  // uploaded a slip in this session, then navigated sub-steps (PaymentSection unmounts);
  // on remount the parent's lead prop may still be stale, but the cache carries us through.
  const cacheKey = `slip:${leadId}:${slipField}`;
  const initialSlip = slipUrl || (typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null);
  const [slipPreview, setSlipPreview] = useState<string | null>(initialSlip);
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(initialSlip);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "verified" | "failed">(initialSlip ? "verified" : "idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // When the parent eventually refreshes and delivers the real slipUrl, sync it in and
  // drop the cache — DB is now the source of truth again.
  useEffect(() => {
    if (verifyStatus === "verifying") return;
    if (slipUrl && slipUrl !== uploadedSlipUrl) {
      setSlipPreview(slipUrl);
      setUploadedSlipUrl(slipUrl);
      setVerifyStatus("verified");
      setVerifyError(null);
      try { localStorage.removeItem(cacheKey); } catch {}
    }
  }, [slipUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
    apiFetch(`/api/qr?amount=${amount}`)
      .then((d: { qrDataUrl: string }) => setQrDataUrl(d.qrDataUrl))
      .catch((err) => { console.error(err); setQrError("สร้าง QR ไม่สำเร็จ"); })
      .finally(() => setQrLoading(false));
  }, [amount]);

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

  // Slip capture → verify (Gemini: is_slip + amount matches) → save to DB
  // IMPORTANT: never silently clear the previously saved slip/status. Only update state
  // after the new attempt has fully passed and been stored.
  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    log("upload_start", { filename: file.name, size: file.size, mime: file.type, expected_amount: amount, current_saved: uploadedSlipUrl });

    // Keep only the latest file: if previous attempt was a temp disk file (failed/unverified),
    // delete it now. A verified DB-backed slip (/api/slips/…) is left in place and replaced
    // later by the upsert in /api/slips POST only when the new attempt succeeds.
    const prevTmp = uploadedSlipUrl && !uploadedSlipUrl.startsWith("/api/slips/") ? uploadedSlipUrl : null;
    if (prevTmp) {
      fetch(`/api/upload?file=${encodeURIComponent(prevTmp)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
    }

    setVerifyStatus("verifying");
    setVerifyError(null);

    // Show preview of the new attempt locally (doesn't touch saved state).
    const reader = new FileReader();
    reader.onload = ev => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // 1. Upload temp copy to disk so Gemini can fetch it by URL
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "ngrok-skip-browser-warning": "true" }, body: uploadForm });
      const { url: tmpUrl } = await uploadRes.json();
      log("upload_tmp_ok", { tmp_url: tmpUrl });

      // 2. Verify with Gemini: is_slip + amount matches expected
      log("verify_start", { tmp_url: tmpUrl, expected_amount: amount });
      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ imageUrl: tmpUrl }),
      });
      const slipData = await verifyRes.json();
      const amountOk = typeof slipData.amount === "number" && Math.abs(slipData.amount - amount) < 0.01;

      if (!slipData.is_slip || !amountOk) {
        log("verify_fail", {
          tmp_url: tmpUrl, expected_amount: amount, gemini: slipData,
          reason: !slipData.is_slip ? "not_a_slip" : "amount_mismatch",
        });
        // Failed: point uploadedSlipUrl at the tmp file so ✕ can clean it up,
        // but do NOT delete or overwrite the previously-saved slip in DB/lead.pre_slip_url.
        setUploadedSlipUrl(tmpUrl);
        setVerifyError(!slipData.is_slip
          ? "ไม่ใช่สลิปโอนเงิน"
          : `ยอดไม่ตรง (สลิป ${slipData.amount ?? "?"} / ต้องโอน ${amount})`);
        setVerifyStatus("failed");
        return;
      }
      log("verify_success", { tmp_url: tmpUrl, expected_amount: amount, gemini: slipData });

      // 3. Verified → persist file to DB (survives disk wipes)
      const storeForm = new FormData();
      storeForm.append("file", file);
      storeForm.append("lead_id", String(leadId));
      storeForm.append("slip_field", slipField);
      const storeRes = await apiFetch("/api/slips", { method: "POST", body: storeForm });
      const dbUrl: string = storeRes.url;

      // 4. Cleanup temp disk file
      fetch(`/api/upload?file=${encodeURIComponent(tmpUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});

      // 5. PATCH the lead's slip field with the new DB URL (replaces the previous one
      //    server-side only AFTER we have a verified replacement — safe). Await so we can
      //    then trigger a parent refresh before the user navigates away, guaranteeing the
      //    slip is readable from lead.pre_slip_url on any re-render.
      try {
        await apiFetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [slipField]: dbUrl }),
        });
      } catch (e) { console.error(e); }

      log("slip_saved", { db_url: dbUrl });

      setUploadedSlipUrl(dbUrl);
      setSlipPreview(dbUrl);
      setVerifyStatus("verified");
      onVerified?.(dbUrl);

      // Self-heal on remount: if user navigates sub-steps, PaymentSection unmounts and
      // the parent's `lead` prop is stale (no refresh fired). Cache the dbUrl per
      // (leadId, slipField) so a fresh mount can recover the slip without relying on parent.
      try {
        localStorage.setItem(`slip:${leadId}:${slipField}`, dbUrl);
      } catch {}
    } catch {
      // Never clear saved state on error — just mark the current attempt as failed.
      setVerifyStatus("failed");
      setVerifyError("ตรวจสลิปไม่สำเร็จ");
    }
  };

  // Only called when the user explicitly taps the ✕. Guarded so verified slips can't
  // be accidentally wiped — the ✕ button itself is already hidden when verified.
  const removeSlip = async () => {
    if (confirmed) return; // once confirmed, slip is locked — only unconfirm can clear it
    log("slip_removed", { removed_url: uploadedSlipUrl, status: verifyStatus });
    if (uploadedSlipUrl) {
      if (uploadedSlipUrl.startsWith("/api/slips/")) {
        fetch(uploadedSlipUrl, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
        // Also clear lead.pre_slip_url (or whichever slipField) so parent's refresh
        // doesn't re-populate the verified state from stale DB pointer.
        fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({ [slipField]: null }),
        }).catch(() => {});
      } else {
        fetch(`/api/upload?file=${encodeURIComponent(uploadedSlipUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
      }
    }
    setSlipPreview(null);
    setUploadedSlipUrl(null);
    setVerifyStatus("idle");
    setVerifyError(null);
    try { localStorage.removeItem(`slip:${leadId}:${slipField}`); } catch {}
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

      {/* Tabs (hide if only one enabled, or when confirmed — payment is locked) */}
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
            {qrLoading ? (
              <div className="aspect-square rounded-xl border border-gray-200 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
              </div>
            ) : qrError ? (
              <div className="aspect-square rounded-xl border border-red-200 bg-red-50 flex items-center justify-center text-sm font-semibold text-red-600 p-4 text-center">
                {qrError}
              </div>
            ) : qrDataUrl ? (
              <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center gap-2">
                <img src={qrDataUrl} alt="PromptPay QR" className="w-full" />
                <div className="text-center">
                  <div className="text-xs font-semibold text-gray-700">{companyFull}</div>
                  <div className="text-[11px] text-gray-500 font-mono tabular-nums mt-0.5">PromptPay Tax ID: {taxId}</div>
                </div>
              </div>
            ) : null}
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

      {/* Slip upload + Gemini verify */}
      <div className={confirmed ? "" : "pt-2 border-t border-gray-100"}>
        <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id={slipInputId} disabled={confirmed} />
        {slipPreview && (
          <div className={`relative rounded-xl overflow-hidden border max-w-[280px] mx-auto mt-2 ${verifyStatus === "failed" ? "border-red-500 ring-2 ring-red-500/30" : "border-gray-200"}`}>
            <img src={slipPreview} alt="Slip" className="w-full" />
            {!confirmed && (
              <button type="button" onClick={removeSlip}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm" style={{ minHeight: 0 }}>✕</button>
            )}
          </div>
        )}
        {verifyStatus === "idle" && (
          <label htmlFor={slipInputId} className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors mt-2">
            กรุณาอัปโหลดสลิปโอนเงิน
          </label>
        )}
        {verifyStatus === "verifying" && (
          <div className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-amber-500 flex items-center justify-center gap-2 mt-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังตรวจสลิป…
          </div>
        )}
        {verifyStatus === "verified" && !confirmed && (
          <div className="w-full h-11 mt-2 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">✓ ตรวจสลิปแล้ว</div>
        )}
        {confirmed && (
          <div className="w-full h-11 mt-2 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">✓ ยืนยันการชำระเงินเรียบร้อย</div>
        )}
        {verifyStatus === "failed" && (
          <div className="w-full mt-2 rounded-lg text-sm font-semibold text-white bg-red-500 flex items-center justify-center text-center px-3 py-2.5">
            {verifyError || "ตรวจสลิปไม่ผ่าน"} · กดกากบาทเพื่อลบแล้วลองใหม่
          </div>
        )}
        {/* Confirm button — shown only until confirmed. Once confirmed the button hides;
         * the banner above reflects "ยืนยันการชำระเงินเรียบร้อย". */}
        {stepNo !== undefined && verifyStatus === "verified" && !confirmed && (
          <>
            <button
              type="button"
              disabled={confirming}
              onClick={handleConfirm}
              className="w-full h-11 mt-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirming ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  กำลังยืนยัน…
                </>
              ) : (
                confirmLabel || "ยืนยันรับชำระเงิน"
              )}
            </button>
            {confirmError && (
              <div className="mt-2 text-xs text-red-600 text-center">{confirmError}</div>
            )}
          </>
        )}
      </div>

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
