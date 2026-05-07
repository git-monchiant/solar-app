"use client";

import { useState } from "react";
import { getUserIdHeader } from "@/lib/api";
import { compressImageForOCR } from "@/lib/utils/image-compress";

// Standalone document scanner — extracts the OCR upload+call+status UI from
// CustomerInfoForm so any form (PreSurveyStep, seeker LeadDepositPaymentTab,
// future warranty/order screens) can drop it in without inheriting the rest
// of the customer form.
//
// Wraps /api/ocr (Gemini Vision). Supported docs: ID card, house registration,
// electricity bill, envelope (for address), bank slip (slip is rejected on
// purpose to stop sender names polluting customer fields).

export type ScanFields = {
  full_name?: string;
  phone?: string;
  installation_address?: string;
  id_card_number?: string;
  id_card_address?: string;
  ca_number?: string;
  meter_number?: string;
  utility_provider?: string;
  monthly_bill?: string;
};

type Variant = "card" | "compact";

interface Props {
  /** Called with whatever fields Gemini extracted. Caller picks what to use. */
  onResult: (fields: ScanFields) => void;
  /** Limit Gemini's extraction to a subset (e.g. envelope only needs address).
   * Defaults to all fields. */
  fields?: Array<keyof ScanFields>;
  /** "card" = big tappable card with subtitle (default). "compact" = small
   * inline button suited to dense forms. */
  variant?: Variant;
  /** Override the helper subtitle ("บัตรประชาชน · ทะเบียนบ้าน · บิลค่าไฟ"). */
  subtitle?: string;
  className?: string;
}

const DEFAULT_FIELDS: Array<keyof ScanFields> = [
  "full_name", "phone", "installation_address", "id_card_number",
  "id_card_address", "ca_number", "meter_number", "utility_provider", "monthly_bill",
];

export default function DocumentScanner({
  onResult,
  fields = DEFAULT_FIELDS,
  variant = "card",
  subtitle = "บัตรประชาชน · ทะเบียนบ้าน · บิลค่าไฟ · ซองจดหมาย",
  className,
}: Props) {
  const [status, setStatus] = useState<"idle" | "reading" | "done" | "failed">("idle");
  const inputId = "doc-scanner-" + Math.random().toString(36).slice(2, 8);

  const uploadDoc = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("filename", `ocr_scan_${Date.now()}`);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
      });
      const { url } = await res.json();
      return url;
    } catch { return null; }
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;
    setStatus("reading");
    try {
      const file = await compressImageForOCR(raw);
      const url = await uploadDoc(file);
      if (!url) throw new Error("upload failed");

      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          ...getUserIdHeader(),
        },
        body: JSON.stringify({ imageUrl: url, fields }),
      });
      const ocrJson = await ocrRes.json();
      console.log("[DocScanner] response", ocrJson);
      const data: ScanFields = ocrJson.data || {};

      // Filter to caller's requested fields. Gemini sometimes returns extras
      // (e.g. id_card_address even when caller only asked for installation_address).
      const filtered: ScanFields = {};
      for (const key of fields) {
        if (data[key]) (filtered as Record<string, unknown>)[key] = data[key];
      }
      // Seed installation_address from id_card_address when only the card
      // address came back — typical for ID cards.
      if (data.id_card_address && fields.includes("installation_address") && !filtered.installation_address) {
        filtered.installation_address = data.id_card_address;
      }

      console.log("[DocScanner] filtered", filtered);
      if (Object.keys(filtered).length === 0) {
        setStatus("failed");
        setTimeout(() => setStatus("idle"), 2500);
        return;
      }
      onResult(filtered);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("failed");
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  if (variant === "compact") {
    return (
      <div className={className}>
        <input type="file" accept="image/*" capture="environment" onChange={handleScan} className="hidden" id={inputId} />
        <label
          htmlFor={inputId}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-active-light text-active text-xs font-semibold border border-active/20 cursor-pointer hover:bg-active/10 transition-colors"
        >
          {status === "reading" ? (
            <div className="w-3 h-3 border-2 border-active/30 border-t-active rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          {status === "reading" ? "กำลังอ่าน…" : status === "done" ? "กรอกแล้ว" : status === "failed" ? "อ่านไม่ได้" : "ถ่ายรูป AI อ่าน"}
        </label>
      </div>
    );
  }

  return (
    <div className={className}>
      <input type="file" accept="image/*" capture="environment" onChange={handleScan} className="hidden" id={inputId} />
      <label
        htmlFor={inputId}
        className="flex items-center gap-3 rounded-lg bg-active-light border border-active/20 p-4 cursor-pointer hover:bg-active/10 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-active text-white flex items-center justify-center shrink-0">
          {status === "reading" ? (
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {status === "reading" ? <div className="text-sm font-bold text-active">กำลังอ่านข้อมูล…</div>
            : status === "done" ? <div className="text-sm font-bold text-emerald-700">✓ กรอกข้อมูลแล้ว</div>
            : status === "failed" ? <div className="text-sm font-bold text-gray-700">อ่านไม่ได้ ลองอีกครั้ง</div>
            : <><div className="text-sm font-bold text-active">ถ่ายรูปเอกสาร</div><div className="text-xs text-active/70">{subtitle}</div></>}
        </div>
      </label>
    </div>
  );
}
