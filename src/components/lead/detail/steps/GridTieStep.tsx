"use client";

import type { StepCommonProps } from "./types";
import DoneSection from "./DoneSection";
import StepLayout from "../StepLayout";
import GridTieForm from "./GridTieForm";
import { getGridTieChecklistItems, parseGridTieChecklist } from "@/lib/gridTie";
import { useFileViewer } from "@/lib/hooks/useFileViewer";

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function GridTieStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const fileViewer = useFileViewer();
  const checklist = parseGridTieChecklist(lead.grid_document_checklist);
  const visibleItems = getGridTieChecklistItems(lead.grid_applicant_type || "", lead.grid_utility || "");
  const permitCount = visibleItems.filter(item => checklist[item.id]?.permit === "has").length;

  const renderDoneContent = () => (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Info label="การไฟฟ้า" value={lead.grid_utility} />
        <Info label="เลขที่คำขอ" value={lead.grid_app_no} mono />
        <Info label="ประเภทผู้ยื่น" value={lead.grid_applicant_type === "individual" ? "บุคคลธรรมดา" : lead.grid_applicant_type === "juristic" ? "นิติบุคคล" : null} />
      </div>
      {visibleItems.length > 0 && (
        <DoneSection color="gray" title={`Checklist เอกสาร · Permit ยืนยัน ${permitCount}/${visibleItems.length}`}>
          <div className="space-y-1.5">
            {visibleItems.map(item => {
              const entry = checklist[item.id] || {};
              const confirmed = entry.permit === "has";
              return (
                <div key={item.id} className="flex items-start gap-2 text-xs">
                  <span className={confirmed ? "text-emerald-600" : "text-gray-400"}>{confirmed ? "✓" : "○"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <span className={confirmed ? "font-semibold text-emerald-600" : "font-semibold text-gray-400"}>
                        {confirmed ? "Permit ได้รับแล้ว" : entry.received ? "ตรวจรับแล้ว · รอ Permit" : "ยังไม่ได้รับ"}
                      </span>
                    </div>
                    {entry.note && <div className="mt-0.5 text-gray-400">{entry.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </DoneSection>
      )}
      {lead.grid_application_doc_url && <DocumentLink url={lead.grid_application_doc_url} label="เอกสารยื่นขอขนานไฟ" onClick={fileViewer.handler(lead.grid_application_doc_url, "เอกสารยื่นขอขนานไฟ")} />}
      {lead.grid_permit_doc_url && <DocumentLink url={lead.grid_permit_doc_url} label="ใบอนุญาต / PPA" onClick={fileViewer.handler(lead.grid_permit_doc_url, "ใบอนุญาต / PPA")} />}
      {lead.grid_note && <DoneSection color="gray" title="หมายเหตุ"><div className="whitespace-pre-wrap text-sm text-gray-800">{lead.grid_note}</div></DoneSection>}
    </>
  );

  return (
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={<span className="text-sm font-semibold text-emerald-700">ขนานไฟสำเร็จ</span>}
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
    >
      <GridTieForm lead={lead} mode="final" refresh={refresh} />
    </StepLayout>
  );
}

function DocumentLink({ url, label, onClick }: { url: string; label: string; onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return <a href={url} onClick={onClick} className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200">▣ {label}</a>;
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return <div className="rounded-lg border border-gray-200 bg-gray-50 p-2"><div className="mb-0.5 text-xxs font-bold uppercase tracking-wider text-gray-400">{label}</div><div className={`text-sm font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</div></div>;
}
