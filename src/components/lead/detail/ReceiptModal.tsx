"use client";
import { DownloadIcon } from "@/components/ui/icons";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PdfPreview from "./PdfPreview";
import { useMe } from "@/lib/roles";

export type ReceiptStage = "deposit" | "order_before" | "order_after" | "installment";

interface Props {
  leadId: number;
  stage: ReceiptStage;
  fileLabel: string;
  onClose: () => void;
  /** Override the doc title shown in the rendered PDF. Used when the same
   * receipt template doubles as a Booking Confirmation. */
  title?: string;
  /** Render the SURVEY DATE block (used for Booking Confirmation). */
  showSurvey?: boolean;
  /** Header label inside this modal — defaults to a stage-based label. */
  modalLabel?: string;
  /** Required when stage="installment" — identifies the source payment row. */
  paymentId?: number;
}

const STAGE_TITLE: Record<ReceiptStage, string> = {
  deposit: "ใบเสร็จค่าสำรวจ",
  order_before: "ใบเสร็จงวดก่อนติดตั้ง",
  order_after: "ใบเสร็จงวดหลังติดตั้ง",
  installment: "ใบเสร็จงวดชำระ",
};

function apiUrl(leadId: number, stage: ReceiptStage, userId?: number, title?: string, showSurvey?: boolean, paymentId?: number) {
  const qs = new URLSearchParams({ lead_id: String(leadId), stage, format: "pdf" });
  if (userId) qs.set("user_id", String(userId));
  if (title) qs.set("title", title);
  if (showSurvey) qs.set("show_survey", "1");
  if (paymentId) qs.set("payment_id", String(paymentId));
  return `/api/receipt?${qs.toString()}`;
}

export default function ReceiptModal({ leadId, stage, fileLabel, onClose, title, showSurvey, modalLabel, paymentId }: Props) {
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { me } = useMe();
  const pdfUrl = apiUrl(leadId, stage, me?.id, title, showSurvey, paymentId);
  const headerLabel = modalLabel ?? STAGE_TITLE[stage];

  // Render via portal at document.body so the full-screen overlay can't be
  // trapped by an ancestor's stacking context (e.g. when called from inside
  // StepLayout's header, the modal was only covering that sub-tree).
  useEffect(() => { setMounted(true); }, []);

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

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 flex flex-col safe-top" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="text-white text-sm font-semibold">{headerLabel} · {fileLabel}</div>
        <button type="button" onClick={onClose} className="w-10 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-xl">✕</button>
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
              <DownloadIcon className="w-5 h-5" strokeWidth={2} />
              บันทึก PDF
            </>
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
