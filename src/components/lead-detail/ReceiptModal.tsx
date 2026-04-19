"use client";

import { useState } from "react";

export type ReceiptStage = "booking" | "order_before" | "order_after";

interface Props {
  leadId: number;
  stage: ReceiptStage;
  fileLabel: string;
  type: "pdf" | "png";
  onClose: () => void;
}

const STAGE_TITLE: Record<ReceiptStage, string> = {
  booking: "ใบเสร็จมัดจำ",
  order_before: "ใบเสร็จงวดก่อนติดตั้ง",
  order_after: "ใบเสร็จงวดหลังติดตั้ง",
};

function apiUrl(leadId: number, stage: ReceiptStage, format?: "pdf" | "png") {
  const qs = new URLSearchParams({ lead_id: String(leadId), stage });
  if (format === "pdf") qs.set("format", "pdf");
  return `/api/receipt?${qs.toString()}`;
}

export default function ReceiptModal({ leadId, stage, fileLabel, type, onClose }: Props) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const ext = type === "pdf" ? "pdf" : "png";
    const mime = type === "pdf" ? "application/pdf" : "image/png";
    const url = apiUrl(leadId, stage, type);
    setSaving(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${fileLabel}.${ext}`, { type: mime });
      const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${fileLabel}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex flex-col safe-top" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="text-white text-sm font-semibold">{STAGE_TITLE[stage]} · {fileLabel}</div>
        <button type="button" onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl">✕</button>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4 flex items-start justify-center" onClick={e => e.stopPropagation()}>
        <img src={apiUrl(leadId, stage)} alt="Receipt" className="w-full max-w-[794px] rounded-lg bg-white shadow-xl" />
      </div>
      <div className="px-4 py-3 shrink-0 flex justify-center safe-bottom" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-gray-900 text-sm font-semibold shadow-lg hover:bg-gray-100 disabled:opacity-70 disabled:cursor-wait transition-colors min-w-[160px] justify-center"
        >
          {saving ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              กำลังเตรียม…
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              บันทึก {type === "pdf" ? "PDF" : "รูป"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
