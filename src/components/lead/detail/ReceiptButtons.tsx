"use client";

import { useState } from "react";
import ReceiptModal, { type ReceiptStage } from "./ReceiptModal";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useMe } from "@/lib/roles";

interface Props {
  leadId: number;
  stage: ReceiptStage;
  fileLabel: string;
  /** Compact icon-only pair (like Register done state). Default: false (full buttons). */
  compact?: boolean;
  /** Override the receipt PDF title (e.g. "BOOKING CONFIRMATION"). */
  title?: string;
  /** Render the SURVEY DATE block — used for the booking-confirmation variant. */
  showSurvey?: boolean;
  /** Override the button text. Default: "ใบเสร็จ" / "ใบเสร็จ PDF". */
  label?: string;
  /** Override the modal header (mobile in-app preview). */
  modalLabel?: string;
}

export default function ReceiptButtons({ leadId, stage, fileLabel, compact, title, showSurvey, label, modalLabel }: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { me } = useMe();

  // Mobile → in-app modal. Desktop → new tab with the native PDF viewer.
  // user_id stamps the receipt with the signer's signature/name.
  const openReceipt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobile) {
      setOpen(true);
    } else {
      const qs = new URLSearchParams({ lead_id: String(leadId), stage, format: "pdf" });
      if (me?.id) qs.set("user_id", String(me.id));
      if (title) qs.set("title", title);
      if (showSurvey) qs.set("show_survey", "1");
      window.open(`/api/receipt?${qs.toString()}`, "_blank", "noreferrer");
    }
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 shrink-0">
        <button type="button" onClick={openReceipt} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          {label || "ใบเสร็จ"}
        </button>
        {open && (
          <ReceiptModal leadId={leadId} stage={stage} fileLabel={fileLabel} onClose={() => setOpen(false)} title={title} showSurvey={showSurvey} modalLabel={modalLabel} />
        )}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={openReceipt} className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        {label || "ใบเสร็จ PDF"}
      </button>
      {open && (
        <ReceiptModal leadId={leadId} stage={stage} fileLabel={fileLabel} onClose={() => setOpen(false)} title={title} showSurvey={showSurvey} modalLabel={modalLabel} />
      )}
    </>
  );
}
