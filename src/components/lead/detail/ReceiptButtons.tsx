"use client";

import { useState } from "react";
import ReceiptModal, { type ReceiptStage } from "./ReceiptModal";

interface Props {
  leadId: number;
  stage: ReceiptStage;
  fileLabel: string;
  /** Compact icon-only pair (like Register done state). Default: false (full buttons). */
  compact?: boolean;
}

export default function ReceiptButtons({ leadId, stage, fileLabel, compact }: Props) {
  const [open, setOpen] = useState<"pdf" | "png" | null>(null);

  const openReceipt = (type: "pdf" | "png") => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(type);
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 shrink-0">
        <button type="button" onClick={openReceipt("pdf")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          PDF
        </button>
        <button type="button" onClick={openReceipt("png")} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          PNG
        </button>
        {open && (
          <ReceiptModal leadId={leadId} stage={stage} fileLabel={fileLabel} type={open} onClose={() => setOpen(null)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 w-full">
        <button type="button" onClick={openReceipt("pdf")} className="flex-1 h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          ใบเสร็จ PDF
        </button>
        <button type="button" onClick={openReceipt("png")} className="flex-1 h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          ใบเสร็จ PNG
        </button>
      </div>
      {open && (
        <ReceiptModal leadId={leadId} stage={stage} fileLabel={fileLabel} type={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
