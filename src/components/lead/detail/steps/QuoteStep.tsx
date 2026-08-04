"use client";
import { DocumentIcon } from "@/components/ui/icons";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps, Package } from "./types";
import FallbackImage from "@/components/ui/FallbackImage";
import StepLayout from "../StepLayout";
import { formatTHB, formatThaiDate as formatDate } from "@/lib/utils/formatters";
import { parseQuotationFiles } from "@/lib/utils/quotation";
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import DoneSection from "./DoneSection";
import QuotationBuilder from "./QuotationBuilder";
import QuoteStepLegacy from "./QuoteStepLegacy";

interface Props extends StepCommonProps {
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

// Dispatch by quotation system version. Leads that issued a quotation under the
// old upload-a-PDF flow are pinned to 'v1' (migration 136) and keep that whole
// UI; everyone else (quotation_version NULL) gets the new QuotationBuilder.
// Kept as a thin wrapper so each branch owns its own hooks — a conditional
// return inside one component would violate the rules of hooks.
export default function QuoteStep(props: Props) {
  if (props.lead.quotation_version === "v1") return <QuoteStepLegacy {...props} />;
  return <QuoteStepV2 {...props} />;
}

function QuoteStepV2({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const fileViewer = useFileViewer();
  const [note, setNote] = useState(lead.quotation_note || "");

  // Auto-save the optional note so a refresh does not lose what the user typed.
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotation_note: note || null }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const renderDoneContent = () => {
    const options = parseQuotationFiles(lead.quotation_files, lead.quotation_doc_no || "", lead.quotation_amount || 0);
    const acceptedIdx = lead.quotation_accepted_idx;
    const visibleOptions = options.map((option, originalIndex) => ({
      option,
      originalIndex,
    }));
    return (
      <>
        {typeof lead.quotation_amount === "number" && acceptedIdx !== null && (
          <DoneSection color="blue" title={options.length > 1 ? "มูลค่าที่ลูกค้าเลือก" : "มูลค่าตามใบเสนอราคา"}>
            <div className="text-lg font-bold font-mono tabular-nums text-gray-900">{formatTHB(lead.quotation_amount)} บาท</div>
          </DoneSection>
        )}

        {(lead.quotation_sent_date || lead.quotation_by) && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {lead.quotation_sent_date && (
              <div>
                <div className="text-xxs font-bold text-gray-400 uppercase tracking-wider">วันที่ส่ง</div>
                <div className="text-sm font-medium text-gray-800">{formatDate(lead.quotation_sent_date)}</div>
              </div>
            )}
            {lead.quotation_by && (
              <div>
                <div className="text-xxs font-bold text-gray-400 uppercase tracking-wider">ผู้จัดทำ</div>
                <div className="text-sm font-medium text-gray-800">{lead.quotation_by}</div>
              </div>
            )}
          </div>
        )}

        {lead.quotation_note && (
          <DoneSection color="gray" title="บันทึก">
            <div className="text-gray-800 whitespace-pre-wrap">{lead.quotation_note}</div>
          </DoneSection>
        )}

        {options.length > 0 && (
          <DoneSection
            color="orange"
            title={`ใบเสนอราคา${options.length > 1 ? ` (${options.length} ชุด)` : ""}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {visibleOptions.map(({ option: opt, originalIndex: i }) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(opt.url);
                const urlFileName = opt.url.split("?")[0].split("/").pop();
                const fileName = opt.doc_no
                  ? `${opt.doc_no.replace(/\.pdf$/i, "")}.pdf`
                  : urlFileName || `ไฟล์ ${i + 1}`;
                const isAccepted = acceptedIdx === i;
                return (
                  <div key={i} className={`rounded-lg border p-2 ${isAccepted ? "border-emerald-400 bg-emerald-50/60" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">ชุด {i + 1}</div>
                      {isAccepted && <div className="text-xxs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">เลือกแล้ว</div>}
                    </div>
                    {isImage ? (
                      <a href={opt.url} onClick={fileViewer.handler(opt.url, `ใบเสนอราคา ชุด ${i + 1}`)} className="block">
                        <FallbackImage src={opt.url} alt={fileName} className="max-h-32 max-w-full object-contain bg-gray-50 rounded border border-gray-200 hover:opacity-80 transition" fallbackLabel="ไฟล์หาย" />
                      </a>
                    ) : (
                      <a href={opt.url} onClick={fileViewer.handler(opt.url, `ใบเสนอราคา ชุด ${i + 1}`)} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
                        <DocumentIcon className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />
                        <span className="text-xs text-primary font-semibold truncate">{fileName}</span>
                      </a>
                    )}
                    <div className="mt-1.5 text-sm font-bold font-mono tabular-nums text-gray-900">{formatTHB(opt.amount)} บาท</div>
                    {opt.doc_no && <div className="text-xxs text-gray-500 font-mono mt-0.5">{opt.doc_no}</div>}
                  </div>
                );
              })}
            </div>
          </DoneSection>
        )}
      </>
    );
  };

  return (
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={(() => {
        // Compact ใบเสนอราคา button in the done header — mirrors the
        // pattern PreSurvey uses (ใบยืนยันการจอง / ใบเสร็จ). Opens the
        // accepted set when the customer has picked; otherwise the first
        // available. Hidden when no files exist yet.
        const options = parseQuotationFiles(lead.quotation_files, lead.quotation_doc_no || "", lead.quotation_amount || 0);
        const acceptedIdx = lead.quotation_accepted_idx;
        const pick = (acceptedIdx != null && options[acceptedIdx]) ? options[acceptedIdx] : options[0];
        return (
          <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
            <span className="text-sm font-semibold text-emerald-700 md:flex-1 md:truncate">
              ส่งใบเสนอราคาแล้ว{typeof lead.quotation_amount === "number" ? ` · ${formatTHB(lead.quotation_amount)} บาท` : ""}
            </span>
            {pick && (
              <a
                href={pick.url}
                onClick={fileViewer.handler(pick.url, `ใบเสนอราคา${acceptedIdx != null ? " (ที่ลูกค้าเลือก)" : ""}`)}
                className="md:mr-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
              >
                <DocumentIcon className="w-4 h-4" strokeWidth={2} />
                ใบเสนอราคา
              </a>
            )}
          </div>
        );
      })()}
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
    >
      <div className="space-y-3">
        <QuotationBuilder
          lead={lead}
          packages={packages}
          refresh={refresh}
          salesNote={note}
          onSalesNoteChange={setNote}
        />
      </div>
    </StepLayout>
  );
}
