"use client";
import { DocumentIcon } from "@/components/ui/icons";

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
  /** Required when stage="installment" — identifies the source payment row. */
  paymentId?: number;
}

export default function ReceiptButtons({ leadId, stage, fileLabel, compact, title, showSurvey, label, modalLabel, paymentId }: Props) {
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
      if (paymentId) qs.set("payment_id", String(paymentId));
      window.open(`/api/receipt?${qs.toString()}`, "_blank", "noreferrer");
    }
  };

  if (compact) {
    return (
      <>
        {/* Mobile: aspect-square tile + caption underneath. Tile fills 1 grid
            cell of the parent's grid-cols-4 layout. */}
        <div className="md:hidden flex flex-col gap-1">
          <button
            type="button"
            onClick={openReceipt}
            aria-label={label || "ใบเสร็จ"}
            title={label || "ใบเสร็จ"}
            className="aspect-square w-full inline-flex items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
          >
            <DocumentIcon className="w-6 h-6" strokeWidth={1.8} />
          </button>
          <span className="text-xs text-center text-gray-600 truncate leading-tight font-medium">{label || "ใบเสร็จ"}</span>
        </div>
        {/* Desktop: icon + label inline (existing text style) */}
        <button
          type="button"
          onClick={openReceipt}
          className="hidden md:inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark shrink-0"
        >
          <DocumentIcon className="w-4 h-4" strokeWidth={2} />
          {label || "ใบเสร็จ"}
        </button>
        {open && (
          <ReceiptModal leadId={leadId} stage={stage} fileLabel={fileLabel} onClose={() => setOpen(false)} title={title} showSurvey={showSurvey} modalLabel={modalLabel} paymentId={paymentId} />
        )}
      </>
    );
  }

  return (
    <>
      <button type="button" onClick={openReceipt} className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors">
        <DocumentIcon className="w-4 h-4" strokeWidth={2} />
        {label || "ใบเสร็จ PDF"}
      </button>
      {open && (
        <ReceiptModal leadId={leadId} stage={stage} fileLabel={fileLabel} onClose={() => setOpen(false)} title={title} showSurvey={showSurvey} modalLabel={modalLabel} paymentId={paymentId} />
      )}
    </>
  );
}
