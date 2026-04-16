"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import LineConfirmModal from "@/components/LineConfirmModal";
import { buildPaymentFlex } from "@/lib/line-flex";

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

interface Props {
  amount: number;
  leadId: number;
  leadName: string;
  lineId: string | null;
  slipUrl: string | null;
  slipField: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  saving?: boolean;
  hideConfirm?: boolean;
  onSlipUploaded?: (url: string) => void;
  paymentTitle?: string;
  paymentNote?: string;
  details?: { label: string; value: string }[];
}

export default function PaymentSection({ amount, leadId, leadName, lineId, slipUrl, slipField, onConfirm, confirmLabel, confirmDisabled, saving, hideConfirm, onSlipUploaded, paymentTitle, paymentNote, details }: Props) {
  const [paymentTab, setPaymentTab] = useState<"qr" | "link">("qr");
  const [linkCopied, setLinkCopied] = useState(false);
  const [slipPreview, setSlipPreview] = useState<string | null>(slipUrl);
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(slipUrl);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "verified" | "failed">(slipUrl ? "verified" : "idle");
  const [lineSending, setLineSending] = useState<string | null>(null);
  const [lineSent, setLineSent] = useState<string | null>(null);
  const [lineConfirmType, setLineConfirmType] = useState<"qr" | "link" | null>(null);

  const sendViaLine = async (type: "qr" | "link") => {
    if (!lineId) return;
    setLineConfirmType(null);
    setLineSending(type);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const payUrl = `${origin}/pay/${leadId}`;
      const qrFullUrl = `${origin}/api/qr?amount=${amount}&format=full&name=${encodeURIComponent(leadName)}`;
      const messages = [buildPaymentFlex({
        origin, title: paymentTitle || "ชำระเงิน", amount, name: leadName,
        actionLabel: "ชำระเงิน", actionUrl: payUrl,
        qrUrl: type === "qr" ? qrFullUrl : undefined,
        note: paymentNote,
        details,
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

  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyStatus("verifying");

    if (uploadedSlipUrl) {
      fetch(`/api/upload?file=${encodeURIComponent(uploadedSlipUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
      setUploadedSlipUrl(null);
    }

    const reader = new FileReader();
    reader.onload = ev => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "ngrok-skip-browser-warning": "true" }, body: formData });
      const { url } = await uploadRes.json();
      setUploadedSlipUrl(url);
      onSlipUploaded?.(url);
      apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [slipField]: url }),
      }).catch(console.error);
      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const { is_slip } = await verifyRes.json();
      setVerifyStatus(is_slip ? "verified" : "failed");
    } catch {
      setVerifyStatus("failed");
    }
  };

  const inputId = `slip-${slipField}`;

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 -mx-3 px-3">
        <button type="button" onClick={() => setPaymentTab("qr")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${paymentTab === "qr" ? "text-active border-active" : "text-gray-400 border-transparent hover:text-gray-600"}`}>
          Thai QR
        </button>
        <button type="button" onClick={() => setPaymentTab("link")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${paymentTab === "link" ? "text-active border-active" : "text-gray-400 border-transparent hover:text-gray-600"}`}>
          Payment Link
        </button>
      </div>

      {/* QR Tab */}
      {paymentTab === "qr" && (
        <div className="space-y-3">
          <div className="max-w-[280px] mx-auto">
            <img src={`/api/qr?amount=${amount}&format=full&name=${encodeURIComponent(leadName)}&_=${Date.now()}`} alt="Thai QR Payment" className="w-full rounded-xl border border-gray-200" />
          </div>
          <button type="button" disabled={lineSending === "qr" || !lineId} onClick={() => setLineConfirmType("qr")}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
              lineSent === "qr" ? "bg-emerald-500 text-white" : lineSent === "error" ? "bg-red-500 text-white" : !lineId ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
            }`}>
            {lineSending === "qr" ? "กำลังส่ง..." : lineSent === "qr" ? "✓ ส่งแล้ว" : lineSent === "error" ? "ส่งไม่สำเร็จ" : !lineId ? "ยังไม่ได้เชื่อม LINE" : "ส่ง QR ให้ลูกค้า"}
          </button>
        </div>
      )}

      {/* Link Tab */}
      {paymentTab === "link" && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500">ส่งลิ้งค์นี้ให้ลูกค้าเปิดบนมือถือ เพื่อสแกน QR และชำระเงินได้ด้วยตนเอง</div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลิ้งค์ชำระเงิน</div>
              <div className="text-xs font-mono text-gray-800 truncate mt-0.5">
                {typeof window !== "undefined" ? `${window.location.origin}/pay/${leadId}` : `/pay/${leadId}`}
              </div>
            </div>
            <button type="button" onClick={() => {
              const url = `${window.location.origin}/pay/${leadId}`;
              navigator.clipboard.writeText(url);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }} className="shrink-0 h-9 px-3 rounded-md text-xs font-semibold bg-active text-white hover:brightness-110 transition-all cursor-pointer">
              {linkCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <button type="button" disabled={lineSending === "link" || !lineId} onClick={() => setLineConfirmType("link")}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
              lineSent === "link" ? "bg-emerald-500 text-white" : lineSent === "error" ? "bg-red-500 text-white" : !lineId ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
            }`}>
            {lineSending === "link" ? "กำลังส่ง..." : lineSent === "link" ? "✓ ส่งแล้ว" : lineSent === "error" ? "ส่งไม่สำเร็จ" : !lineId ? "ยังไม่ได้เชื่อม LINE" : "ส่งลิ้งค์ให้ลูกค้า"}
          </button>
        </div>
      )}

      {/* Slip upload */}
      <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id={inputId} />
      {slipPreview && (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 max-w-[280px] mx-auto mt-2">
          <img src={slipPreview} alt="Slip" className="w-full" />
          <button onClick={() => { setSlipPreview(null); setUploadedSlipUrl(null); setVerifyStatus("idle"); }}
            className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm" style={{ minHeight: 0 }}>✕</button>
        </div>
      )}
      {verifyStatus === "idle" && (
        <label htmlFor={inputId} className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors">
          กรุณาอัปโหลดสลิปโอนเงิน
        </label>
      )}
      {verifyStatus === "verifying" && (
        <div className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-amber-500 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying…
        </div>
      )}
      {verifyStatus === "verified" && (
        <div className="w-full h-9 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">✓ ตรวจสลิปแล้ว</div>
      )}
      {verifyStatus === "failed" && (
        <div className="space-y-2">
          <div className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-red-500 flex items-center justify-center">ตรวจสลิปไม่ผ่าน</div>
          <button onClick={() => { setVerifyStatus("idle"); setSlipPreview(null); setUploadedSlipUrl(null); }}
            className="w-full h-9 rounded-lg text-xs text-gray-600 border border-gray-200">ลองอีกครั้ง</button>
        </div>
      )}

      {/* Confirm button */}
      {!hideConfirm && onConfirm && (
        <button onClick={onConfirm} disabled={confirmDisabled || saving || !uploadedSlipUrl || verifyStatus !== "verified"}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
          {saving ? "กำลังยืนยัน..." : confirmLabel}
        </button>
      )}

      {/* LINE confirm modal */}
      {lineConfirmType && (
        <LineConfirmModal
          name={leadName}
          description={lineConfirmType === "qr" ? "ส่ง QR ชำระเงิน" : "ส่งลิ้งค์ชำระเงิน"}
          onCancel={() => setLineConfirmType(null)}
          onConfirm={() => sendViaLine(lineConfirmType)}
        />
      )}
    </div>
  );
}
