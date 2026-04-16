"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import LineConfirmModal from "@/components/LineConfirmModal";
import PaymentHeader from "./PaymentHeader";
import { buildPaymentFlex } from "@/lib/line-flex";

interface Props {
  // Text
  paymentTitle: string;
  amountLabel: string;
  amount: number;

  // Context
  leadId: number;
  leadName: string;
  lineId: string | null;

  // Slip persistence
  slipUrl: string | null;
  slipField: string;

  // Optional
  paymentNote?: string;
  details?: { label: string; value: string }[];
  onVerified?: (url: string) => void;
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
}: Props) {
  const [qrEnabled, setQrEnabled] = useState(true);
  const [linkEnabled, setLinkEnabled] = useState(true);
  const [paymentTab, setPaymentTab] = useState<"qr" | "link">("qr");
  const [linkCopied, setLinkCopied] = useState(false);
  const [kbankQr, setKbankQr] = useState<{ id: number; image_base64: string; access_token: string } | null>(null);
  const [kbankPaid, setKbankPaid] = useState(false);

  const [slipPreview, setSlipPreview] = useState<string | null>(slipUrl);
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(slipUrl);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "verified" | "failed">(slipUrl ? "verified" : "idle");

  const [lineSending, setLineSending] = useState<string | null>(null);
  const [lineSent, setLineSent] = useState<string | null>(null);
  const [lineConfirmType, setLineConfirmType] = useState<"qr" | "link" | null>(null);

  // Load settings (which payment methods are enabled) — skip once slip already saved
  useEffect(() => {
    if (slipUrl) return;
    apiFetch("/api/settings").then((s: Record<string, string>) => {
      const qr = s.payment_qr_enabled !== "false";
      const link = s.payment_link_enabled !== "false";
      setQrEnabled(qr);
      setLinkEnabled(link);
      if (!qr && link) setPaymentTab("link");
    }).catch(console.error);
  }, [slipUrl]);

  // Ensure a pending KBank QR exists for this lead (reuses existing / authorized)
  const [qrError, setQrError] = useState<string | null>(null);
  const createdForRef = useRef<number | null>(null);
  const fetchQr = () => {
    setQrError(null);
    apiFetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId }),
    }).then((tx: { id: number; qr_image_base64?: string; status?: string; access_token?: string }) => {
      if (tx.qr_image_base64) {
        setKbankQr({ id: tx.id, image_base64: tx.qr_image_base64, access_token: tx.access_token || "" });
      } else {
        setQrError("ไม่ได้รับ QR จาก KBank");
      }
      if (tx.status === "authorized") setKbankPaid(true);
    }).catch((err) => {
      console.error(err);
      setQrError("โหลด QR ไม่สำเร็จ");
      createdForRef.current = null; // allow retry
    });
  };
  useEffect(() => {
    if (!qrEnabled || createdForRef.current === leadId) return;
    createdForRef.current = leadId;
    fetchQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, qrEnabled]);

  const verifyKbankPayment = async (): Promise<boolean> => {
    if (!kbankQr) return false;
    try {
      const data = await apiFetch(`/api/payments/${kbankQr.id}/status`);
      if (data.status === "authorized") {
        setKbankPaid(true);
        return true;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  };

  const sendViaLine = async (type: "qr" | "link") => {
    if (!lineId) return;
    setLineConfirmType(null);
    setLineSending(type);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // Reuse existing pending QR if still valid; server only creates a new one if expired.
      const fresh = kbankPaid ? null : await apiFetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      }) as { id: number; qr_image_base64: string; access_token: string } | null;
      if (fresh) {
        setKbankQr({ id: fresh.id, image_base64: fresh.qr_image_base64, access_token: fresh.access_token || "" });
      }
      const qrTxId = fresh?.id ?? kbankQr?.id;
      const token = fresh?.access_token ?? kbankQr?.access_token;
      const payUrl = token ? `${origin}/pay/${token}` : `${origin}/pay/${leadId}`;
      if (!qrTxId) return;
      const qrFullUrl = `${origin}/api/payments/${qrTxId}/qr-image`;
      const messages = [buildPaymentFlex({
        origin, title: paymentTitle, amount, name: leadName,
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

    // Clear any previous slip (disk cleanup for legacy /uploads/; DB entry deleted via /api/slips/<id>)
    if (uploadedSlipUrl) {
      if (uploadedSlipUrl.startsWith("/api/slips/")) {
        fetch(uploadedSlipUrl, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
      } else {
        fetch(`/api/upload?file=${encodeURIComponent(uploadedSlipUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
      }
      setUploadedSlipUrl(null);
    }

    const reader = new FileReader();
    reader.onload = ev => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // Step 1: upload temp copy to disk for slip-verify (OCR reads the URL)
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "ngrok-skip-browser-warning": "true" }, body: uploadForm });
      const { url: tmpUrl } = await uploadRes.json();

      // Step 2: verify slip (OCR + amount + KBank authorization)
      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ imageUrl: tmpUrl }),
      });
      const slipData = await verifyRes.json();
      const expectedAmount = kbankQr ? 1 : null;
      const amountMatches = !expectedAmount || (typeof slipData.amount === "number" && slipData.amount === expectedAmount);
      const verified = slipData.is_slip && amountMatches && (await verifyKbankPayment());

      if (verified) {
        // Step 3: persist file in DB (survives disk wipes/sweeps)
        const storeForm = new FormData();
        storeForm.append("file", file);
        storeForm.append("lead_id", String(leadId));
        storeForm.append("slip_field", slipField);
        const storeRes = await apiFetch("/api/slips", { method: "POST", body: storeForm });
        const dbUrl: string = storeRes.url;

        // Step 4: cleanup temp disk file
        fetch(`/api/upload?file=${encodeURIComponent(tmpUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});

        // Step 5: PATCH lead with DB-backed URL
        apiFetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [slipField]: dbUrl }),
        }).catch(console.error);

        setUploadedSlipUrl(dbUrl);
        setSlipPreview(dbUrl);
        setVerifyStatus("verified");
        onVerified?.(dbUrl);
      } else {
        // Verify failed — keep temp disk file visible so user sees what failed, but don't PATCH DB
        setUploadedSlipUrl(tmpUrl);
        setVerifyStatus("failed");
      }
    } catch {
      setVerifyStatus("failed");
    }
  };

  const inputId = `slip-${slipField}`;

  return (
    <div className="space-y-3">
      <PaymentHeader title={paymentTitle} amount={amount} amountLabel={amountLabel} />

      {/* Tabs (hide if only one enabled) */}
      {qrEnabled && linkEnabled && (
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
      )}

      {/* QR Tab */}
      {qrEnabled && paymentTab === "qr" && (
        <div className="space-y-3">
          <div className="max-w-[280px] mx-auto">
            {kbankQr && kbankQr.image_base64 ? (
              <img src={`data:image/png;base64,${kbankQr.image_base64}`} alt="Thai QR Payment" className="w-full rounded-xl border border-gray-200" />
            ) : qrError ? (
              <div className="aspect-square rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="text-sm font-semibold text-red-600">{qrError}</div>
                <button type="button" onClick={() => { createdForRef.current = leadId; fetchQr(); }}
                  className="h-9 px-4 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">
                  ลองอีกครั้ง
                </button>
              </div>
            ) : (
              <div className="aspect-square rounded-xl border border-gray-200 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button type="button" disabled={lineSending === "qr" || !lineId || kbankPaid} onClick={() => setLineConfirmType("qr")}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
              lineSent === "qr" ? "bg-emerald-500 text-white" : lineSent === "error" ? "bg-red-500 text-white" : kbankPaid ? "bg-gray-200 text-gray-400 cursor-not-allowed" : !lineId ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
            }`}>
            {lineSending === "qr" ? "กำลังส่ง..." : lineSent === "qr" ? "✓ ส่งแล้ว" : lineSent === "error" ? "ส่งไม่สำเร็จ" : kbankPaid ? "ชำระเงินเรียบร้อยแล้ว" : !lineId ? "ยังไม่ได้เชื่อม LINE" : "ส่ง QR ให้ลูกค้า"}
          </button>
        </div>
      )}

      {/* Link Tab */}
      {linkEnabled && paymentTab === "link" && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500">ส่งลิ้งค์นี้ให้ลูกค้าเปิดบนมือถือ เพื่อสแกน QR และชำระเงินได้ด้วยตนเอง</div>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลิ้งค์ชำระเงิน</div>
            <div className="text-xs font-mono text-gray-800 break-all mt-0.5">
              {typeof window !== "undefined" ? `${window.location.origin}/pay/${kbankQr?.access_token || leadId}` : `/pay/${leadId}`}
            </div>
            <div className="flex justify-end mt-2">
              <button type="button" onClick={() => {
                const url = `${window.location.origin}/pay/${kbankQr?.access_token || leadId}`;
                navigator.clipboard.writeText(url);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }} className="h-8 px-3 rounded-md text-xs font-semibold bg-active text-white hover:brightness-110 transition-all cursor-pointer">
                {linkCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
          <button type="button" disabled={lineSending === "link" || !lineId || kbankPaid} onClick={() => setLineConfirmType("link")}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
              lineSent === "link" ? "bg-emerald-500 text-white" : lineSent === "error" ? "bg-red-500 text-white" : kbankPaid ? "bg-gray-200 text-gray-400 cursor-not-allowed" : !lineId ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
            }`}>
            {lineSending === "link" ? "กำลังส่ง..." : lineSent === "link" ? "✓ ส่งแล้ว" : lineSent === "error" ? "ส่งไม่สำเร็จ" : kbankPaid ? "ชำระเงินเรียบร้อยแล้ว" : !lineId ? "ยังไม่ได้เชื่อม LINE" : "ส่งลิ้งค์ให้ลูกค้า"}
          </button>
        </div>
      )}

      {/* Slip upload */}
      <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id={inputId} />
      {slipPreview ? (
        <div className={`relative rounded-xl overflow-hidden border max-w-[280px] mx-auto mt-2 ${verifyStatus === "failed" ? "border-red-500 ring-2 ring-red-500/30" : "border-gray-200"}`}>
          <img src={slipPreview} alt="Slip" className="w-full" />
          {verifyStatus !== "verified" && (
            <button onClick={() => {
              if (uploadedSlipUrl) {
                if (uploadedSlipUrl.startsWith("/api/slips/")) {
                  fetch(uploadedSlipUrl, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
                } else {
                  fetch(`/api/upload?file=${encodeURIComponent(uploadedSlipUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
                }
              }
              setSlipPreview(null); setUploadedSlipUrl(null); setVerifyStatus("idle");
            }}
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm" style={{ minHeight: 0 }}>✕</button>
          )}
        </div>
      ) : null}
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
        <div className="w-full h-11 mt-3 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">✓ ตรวจสลิปแล้ว</div>
      )}
      {verifyStatus === "failed" && (
        <div className="w-full h-11 mt-3 rounded-lg text-sm font-semibold text-white bg-red-500 flex items-center justify-center">ตรวจสลิปไม่ผ่าน · กดกากบาทเพื่อลบแล้วลองใหม่</div>
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
