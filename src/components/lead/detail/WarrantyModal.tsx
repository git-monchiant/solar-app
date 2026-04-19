"use client";

import { useState } from "react";
import PdfPreview from "./PdfPreview";

interface Props {
  leadId: number;
  docNo: string;
  onClose: () => void;
}

export default function WarrantyModal({ leadId, docNo, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const fileLabel = `warranty_${docNo || leadId}`;
  const pdfUrl = `/api/warranty/${leadId}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      const file = new File([blob], `${fileLabel}.pdf`, { type: "application/pdf" });
      const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${fileLabel}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex flex-col safe-top" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="text-white text-sm font-semibold">ใบรับประกัน · {docNo || `#${leadId}`}</div>
        <button type="button" onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl">✕</button>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4 min-h-0" onClick={e => e.stopPropagation()}>
        <PdfPreview pdfUrl={pdfUrl} />
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
              บันทึก PDF
            </>
          )}
        </button>
      </div>
    </div>
  );
}
