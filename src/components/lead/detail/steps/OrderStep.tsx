"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import PaymentSection from "@/components/payment/PaymentSection";
import { buildPaymentFlex } from "@/lib/utils/line-flex";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import ErrorPopup from "@/components/ui/ErrorPopup";
import CustomerInfoForm from "@/components/customer/CustomerInfoForm";
import FallbackImage from "@/components/ui/FallbackImage";
import PaymentSlipsThumbs from "@/components/payment/PaymentSlipsThumbs";
import StepLayout from "../StepLayout";
import ReceiptButtons from "../ReceiptButtons";
import { useSubStep } from "@/lib/hooks/useSubStep";

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const SUB_STEPS = ["ราคา", "ส่งลูกค้า", "นัดหมาย", "ชำระเงิน", "ยืนยัน"];

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function OrderStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const [subStep, setSubStep] = useSubStep(`orderSubStep_${lead.id}`, 0, SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(lead.order_total || lead.quotation_amount || 0);

  // Sync total with latest quotation_amount when it becomes available (user might arrive from QuoteStep
  // after quotation_amount was just saved; useState default only captures first render).
  useEffect(() => {
    if (!lead.order_total && lead.quotation_amount && total !== lead.quotation_amount) {
      setTotal(lead.quotation_amount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.quotation_amount, lead.order_total]);
  const [pctBefore, setPctBefore] = useState<number>(lead.order_pct_before ?? 100);
  const [installDate, setInstallDate] = useState(lead.install_date ? String(lead.install_date).slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [beforeSlipDone, setBeforeSlipDone] = useState(!!lead.order_before_slip);
  const [afterSlipDone, setAfterSlipDone] = useState(!!lead.order_after_slip);
  const [lineSending, setLineSending] = useState(false);
  const [lineSent, setLineSent] = useState(false);
  const [lineConfirm, setLineConfirm] = useState(false);
  const [regName, setRegName] = useState(lead.full_name || "");
  const [regIdCard, setRegIdCard] = useState(lead.id_card_number || "");
  const [regAddress, setRegAddress] = useState(lead.id_card_address || "");
  const [regInstallAddr, setRegInstallAddr] = useState(lead.installation_address || "");

  const pctAfter = 100 - pctBefore;
  // Single-installment (pctBefore = 100): customer already paid the deposit
  // (pre_total_price) at pre-survey, so the remaining before-install payment
  // is total − deposit. For split installments (pctBefore < 100) the deposit
  // is deducted on the งวด 2/2 line in InstallStep instead.
  const depositPaid = lead.pre_total_price || 0;
  const amountBefore = total > 0
    ? (pctBefore >= 100
        ? Math.max(0, total - depositPaid)
        : Math.round(total * pctBefore / 100))
    : 0;
  const amountAfter = total > 0 && pctBefore < 100 ? total - Math.round(total * pctBefore / 100) : 0;

  // Auto-save selections
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_total: total || null,
          order_pct_before: pctBefore,
          order_pct_after: pctAfter,
          install_date: installDate || null,
        }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, pctBefore, installDate]);

  // PaymentSection writes the payments row + flips the paid flag itself. Parent just
  // reacts after the fact — tracks local UI state and refreshes the lead.
  // Payment confirmations stay on the current sub-step — user advances
  // manually via "ถัดไป" so they see the state flip before moving on.
  const onBeforeConfirmed = async () => {
    if (pctBefore >= 100) {
      try { await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "install" }) }); } catch {}
    }
    await refresh();
  };
  const onAfterConfirmed = async () => {
    try { await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "install" }) }); } catch {}
    await refresh();
  };

  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const doneTotal = lead.order_total || 0;
  const donePctBefore = lead.order_pct_before ?? 100;
  const donePctAfter = 100 - donePctBefore;
  const doneAmtBefore = Math.round(doneTotal * donePctBefore / 100);
  const doneAmtAfter = doneTotal - doneAmtBefore;

  const renderDoneContent = () => (
    <>
      {doneTotal > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-700 font-semibold">ยอดรวม</span>
            <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(doneTotal)} บาท</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">ชำระก่อนติดตั้ง {donePctBefore}%</span>
            <span className="font-mono tabular-nums text-gray-400">{fmt(doneAmtBefore)} บาท</span>
          </div>
          {donePctAfter > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">ชำระหลังติดตั้ง</span>
              <span className="font-mono tabular-nums text-gray-400">{fmt(doneAmtAfter)} บาท</span>
            </div>
          )}
          {lead.pre_total_price ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">หักค่าสำรวจ</span>
                <span className="font-mono tabular-nums text-gray-400">-{fmt(lead.pre_total_price)} บาท</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                <span className="text-gray-700 font-semibold">{donePctAfter > 0 ? "ยอดชำระหลังติดตั้งสุทธิ" : "ยอดชำระสุทธิ"}</span>
                <span className="font-bold font-mono tabular-nums text-gray-900">{fmt((donePctAfter > 0 ? doneAmtAfter : doneTotal) - (lead.pre_total_price || 0))} บาท</span>
              </div>
            </>
          ) : null}
        </div>
      )}
      {lead.install_date && (
        <div className="border-l-3 border-amber-400 pl-3">
          <div className="text-xs font-bold text-amber-600 uppercase mb-1">กำหนดเข้าติดตั้ง</div>
          <div className="font-semibold text-gray-800">{formatDate(lead.install_date)}</div>
        </div>
      )}

      {lead.order_before_slip && (
        <div className="border-l-3 border-violet-400 pl-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-bold text-violet-600 uppercase">สลิปก่อนติดตั้ง</div>
            <div className="text-sm font-bold font-mono tabular-nums text-gray-900">{fmt(doneAmtBefore)} บาท</div>
          </div>
          <PaymentSlipsThumbs slipUrl={lead.order_before_slip} label="สลิปก่อนติดตั้ง" />
        </div>
      )}


      {(lead.full_name || lead.id_card_number || lead.id_card_address || lead.installation_address) && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">ข้อมูลขออนุญาตติดตั้ง</div>
          <div className="space-y-0.5">
            {lead.full_name && <div className="flex justify-between"><span className="text-gray-400">ชื่อ-นามสกุล</span><span className="text-gray-800 text-right">{lead.full_name}</span></div>}
            {lead.id_card_number && <div className="flex justify-between"><span className="text-gray-400">เลขบัตร ปชช.</span><span className="font-mono tabular-nums text-gray-800">{lead.id_card_number}</span></div>}
            {lead.id_card_address && <div className="flex flex-col"><span className="text-gray-400">ที่อยู่ตามบัตร</span><span className="text-gray-800">{lead.id_card_address}</span></div>}
            {lead.installation_address && <div className="flex flex-col"><span className="text-gray-400">ที่อยู่ติดตั้ง</span><span className="text-gray-800">{lead.installation_address}</span></div>}
          </div>
        </div>
      )}

      {lead.order_before_paid && (
        <div className="pt-3 border-t border-gray-100">
          <ReceiptButtons leadId={lead.id} stage="order_before" fileLabel={`${lead.pre_doc_no || `lead_${lead.id}`}_before`} />
        </div>
      )}
    </>
  );

  const gateCheck = (from: number): string[] => {
    const missing: string[] = [];
    if (from === 0 && (!total || total <= 0)) missing.push("ยอดรวม");
    if (from === 0 && depositPaid > 0 && total > 0 && total < depositPaid) {
      missing.push(`ยอดต้องไม่ต่ำกว่าค่าสำรวจ (฿${fmt(depositPaid)})`);
    }
    if (from === 0 && (pctBefore === null || pctBefore === undefined)) missing.push("% ชำระก่อนติดตั้ง");
    if (from === 2 && !installDate) missing.push("วันนัดติดตั้ง");
    if (from === 3 && !beforeSlipDone) missing.push("กรุณาอัปโหลดสลิปชำระงวดแรก");
    if (from === 3 && !lead.order_before_paid) missing.push("ยืนยันรับชำระงวดแรก");
    return missing;
  };
  const handleSubStepChange = (n: number) => {
    if (n > subStep) {
      const missing = gateCheck(subStep);
      if (missing.length > 0) { setNextError(missing.join(", ")); return; }
    }
    setNextError(null);
    setSubStep(n);
  };

  return (
    <StepLayout
      state={state}
      subSteps={SUB_STEPS}
      subStep={subStep}
      onSubStepChange={handleSubStepChange}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={
        <>
          <span className="text-sm font-semibold text-gray-900 flex-1">{lead.install_date ? `กำหนดเข้าติดตั้ง ${formatDate(lead.install_date)}` : "ยืนยันการชำระ"}</span>
          {lead.order_before_paid && (
            <div className="mr-4"><ReceiptButtons leadId={lead.id} stage="order_before" fileLabel={`${lead.pre_doc_no || `lead_${lead.id}`}_before`} compact /></div>
          )}
        </>
      }
      renderDone={renderDoneContent}
    >
      {/* Step 0: ใบเสนอราคา */}
      {subStep === 0 && (
        <div className="space-y-3">
          {lead.quotation_files && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
              <div className="text-xs font-bold text-orange-600 uppercase mb-2">ไฟล์ใบเสนอราคา</div>
              <div className="space-y-1.5">
                {lead.quotation_files.split(",").filter(Boolean).map((url, i) => {
                  const fileName = url.split("/").pop() || `ไฟล์ ${i + 1}`;
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                  return (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-orange-100 hover:bg-orange-50 transition-colors">
                      <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={isImage ? "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" : "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                      </svg>
                      <span className="text-sm text-orange-700 font-semibold truncate">{fileName}</span>
                    </a>
                  );
                })}
              </div>
              {lead.quotation_note && <div className="text-xs text-orange-600 mt-2">{lead.quotation_note}</div>}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">จำนวนเงินตามใบเสนอราคา (บาท)</label>
            <input type="number" value={total || ""} onChange={e => setTotal(parseFloat(e.target.value) || 0)} placeholder="0"
              min={depositPaid || 0}
              className={`w-full h-14 px-3 rounded-lg border text-2xl font-bold font-mono focus:outline-none ${
                depositPaid > 0 && total > 0 && total < depositPaid
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-primary"
              }`} />
            {depositPaid > 0 && total > 0 && total < depositPaid && (
              <div className="text-xs text-red-600 mt-1">
                ต้องไม่ต่ำกว่าค่าสำรวจที่จ่ายแล้ว (฿{fmt(depositPaid)})
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">จ่ายก่อนติดตั้ง (%)</label>
            <div className="flex gap-2">
              {[30, 40, 50, 60, 70, 80, 100].map(v => (
                <button key={v} type="button" onClick={() => setPctBefore(v)}
                  className={`flex-1 h-10 rounded-lg text-sm font-semibold border transition-all ${pctBefore === v ? "bg-active text-white border-active" : "bg-white text-gray-700 border-gray-200"}`}>
                  {v}%
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">ก่อนติดตั้ง ({pctBefore}%)</span>
                <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(amountBefore)} บาท</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">หลังติดตั้ง ({pctAfter}%)</span>
                <span className="font-bold font-mono tabular-nums text-gray-900">{fmt(amountAfter)} บาท</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: นัดหมาย */}
      {subStep === 2 && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">กำหนดเข้าติดตั้ง</label>
            <CalendarPicker date={installDate} timeSlot="" onDateChange={setInstallDate} onTimeSlotChange={() => {}} showTimeSlot={false} showSurveySlots excludeLeadId={lead.id} />
          </div>
        </div>
      )}

      {/* Step 1: ส่งใบเสนอราคาให้ลูกค้า */}
      {subStep === 1 && (
        <div className="space-y-3">
          {lead.quotation_files && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
              <div className="text-xs font-bold text-orange-600 uppercase mb-2">ไฟล์ที่จะส่ง</div>
              {lead.quotation_files.split(",").filter(Boolean).map((url, i) => {
                const fileName = url.split("/").pop() || `ไฟล์ ${i + 1}`;
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                return (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-orange-100 hover:bg-orange-50 transition-colors">
                    <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={isImage ? "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" : "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                    </svg>
                    <span className="text-sm text-orange-700 font-semibold truncate">{fileName}</span>
                  </a>
                );
              })}
              {lead.quotation_note && <div className="text-xs text-orange-600 mt-2">{lead.quotation_note}</div>}
            </div>
          )}

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดรวม</span>
              <span className="font-bold font-mono">{fmt(total)} บาท</span>
            </div>
            {pctBefore < 100 && (<>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ชำระก่อนติดตั้ง {pctBefore}%</span>
                <span>{fmt(amountBefore)} บาท</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ชำระหลังติดตั้ง</span>
                <span>{fmt(amountAfter)} บาท</span>
              </div>
            </>)}
            {lead.pre_total_price && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(lead.pre_total_price)} บาท</span>
              </div>
            )}
            {pctBefore >= 100 ? (
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                <span className="text-gray-600">ยอดชำระสุทธิ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(Math.max(0, total - (lead.pre_total_price || 0)))} บาท</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                <span className="text-gray-600">ยอดชำระหลังติดตั้งสุทธิ</span>
                <span className="font-bold font-mono text-gray-900">{fmt(Math.max(0, amountAfter - (lead.pre_total_price || 0)))} บาท</span>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={lineSending || !lead.line_id}
            onClick={() => setLineConfirm(true)}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
              lineSent ? "bg-emerald-500 text-white" : !lead.line_id ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
            {lineSending ? "กำลังส่ง..." : lineSent ? "✓ ส่งแล้ว" : !lead.line_id ? "ยังไม่ได้เชื่อม LINE" : "ส่งใบเสนอราคาให้ลูกค้า"}
          </button>

          {lineConfirm && (
            <LineConfirmModal
              name={lead.full_name}
              description="ส่งใบเสนอราคาทาง LINE"
              onCancel={() => setLineConfirm(false)}
              onConfirm={async () => {
                setLineConfirm(false);
                setLineSending(true);
                try {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  // quotation_files is CSV of URLs — LINE button needs a single valid
                  // URI, so pick the first file only.
                  const firstFile = (lead.quotation_files || "").split(",").filter(Boolean)[0] || "";
                  const downloadUrl = firstFile.startsWith("http") ? firstFile : `${origin}${firstFile}`;
                  const deposit = lead.pre_total_price || 0;
                  const details: { label: string; value: string }[] = [];
                  details.push({ label: "ยอดรวม", value: `฿${fmt(total)}` });
                  if (pctBefore < 100) {
                    // Split installment: breakdown + deposit is deducted on the
                    // "after install" line.
                    details.push({ label: `ก่อนติดตั้ง ${pctBefore}%`, value: `฿${fmt(amountBefore)}` });
                    details.push({ label: `หลังติดตั้ง ${pctAfter}%`, value: `฿${fmt(amountAfter)}` });
                    if (deposit > 0) {
                      details.push({ label: "หักค่าสำรวจ (งวด 2)", value: `-฿${fmt(deposit)}` });
                      details.push({ label: "ยอดสุทธิหลังติดตั้ง", value: `฿${fmt(Math.max(0, amountAfter - deposit))}` });
                    }
                  } else {
                    // Single installment: customer already paid the deposit at
                    // pre-survey, so remaining = total − deposit.
                    if (deposit > 0) {
                      details.push({ label: "หักค่าสำรวจ", value: `-฿${fmt(deposit)}` });
                    }
                    details.push({ label: "ยอดที่ต้องชำระ", value: `฿${fmt(Math.max(0, total - deposit))}` });
                  }
                  const messages = [buildPaymentFlex({
                    origin, title: "ใบเสนอราคา", amount: total, name: lead.full_name,
                    actionLabel: "รายละเอียดใบเสนอราคา", actionUrl: downloadUrl, details,
                  })];
                  await apiFetch("/api/line/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead_id: lead.id, messages }),
                  });
                  setLineSent(true);
                } catch {
                  setLineSent(false);
                } finally {
                  setLineSending(false);
                }
              }}
            />
          )}
        </div>
      )}

      {/* Step 3: ชำระเงิน */}
      {subStep === 3 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดรวม</span>
              <span className="font-bold font-mono">{fmt(total)} บาท</span>
            </div>
            {installDate && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">กำหนดเข้าติดตั้ง</span>
                <span className="font-semibold">{formatDate(installDate)}</span>
              </div>
            )}
          </div>

          {/* ชำระก่อนติดตั้ง */}
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <PaymentSection
              paymentTitle="ชำระก่อนติดตั้ง"
              amountLabel={pctAfter > 0 ? "งวด 1/2" : "ชำระเต็มจำนวน"}
              amount={amountBefore}
              leadId={lead.id}
              leadName={lead.full_name}
              lineId={lead.line_id}
              slipUrl={lead.order_before_slip}
              slipField="order_before_slip"
              stepNo={3}
              description={pctAfter > 0 ? `ชำระก่อนติดตั้ง งวด 1/2 (${pctBefore}%)` : "ชำระเต็มจำนวน ก่อนติดตั้ง"}
              docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-1` : null}
              confirmed={!!lead.order_before_paid}
              onConfirmed={onBeforeConfirmed}
              onUndone={refresh}
              onVerified={() => setBeforeSlipDone(true)}
              details={[
                ...(pctBefore >= 100 && depositPaid > 0
                  ? [
                      { label: "ยอดเต็ม", value: `฿${fmt(total)}` },
                      { label: "หักค่าสำรวจ", value: `-฿${fmt(depositPaid)}` },
                      { label: "ยอดที่ต้องชำระ", value: `฿${fmt(amountBefore)}` },
                    ]
                  : [{ label: `ยอดชำระ (งวด 1/${pctAfter > 0 ? "2" : "1"})`, value: `฿${fmt(amountBefore)}` }]),
              ]}
            />
          </div>

          {/* ชำระหลังติดตั้ง — moved to InstallStep (เก็บเงิน subStep) */}
        </div>
      )}

      {/* Step 4: ยืนยันข้อมูลขออนุญาต */}
      {subStep === 4 && (
        <div className="space-y-3">
          <CustomerInfoForm
            values={{}}
            onChange={(patch) => {
              // Skip full_name — don't overwrite from OCR
              if (patch.id_card_number) setRegIdCard(patch.id_card_number.slice(0, 13));
              if (patch.id_card_address) setRegAddress(patch.id_card_address);
              if (patch.installation_address) setRegInstallAddr(patch.installation_address);
            }}
            fields={[]}
            showScan
          />
          <div className="rounded-lg border border-active/15 bg-white/60 p-3 space-y-2.5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลขออนุญาตติดตั้ง</div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ชื่อ-นามสกุล</label>
              <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน</label>
              <input type="text" inputMode="numeric" maxLength={13} value={regIdCard} onChange={e => setRegIdCard(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก" className="w-full h-10 px-3 rounded-lg border border-gray-200 font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน</label>
              <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ติดตั้ง</label>
              <textarea value={regInstallAddr} onChange={e => setRegInstallAddr(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
            </div>
          </div>

          <button
            onClick={async () => {
              setSaving(true);
              try {
                await apiFetch(`/api/leads/${lead.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    full_name: regName || undefined,
                    id_card_number: regIdCard || undefined,
                    id_card_address: regAddress || undefined,
                    installation_address: regInstallAddr || undefined,
                    status: "install",
                  }),
                });
                await refresh();
              } finally { setSaving(false); }
            }}
            disabled={saving}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกและไปขั้นตอนติดตั้ง"}
          </button>
        </div>
      )}

      {/* Navigation buttons */}
      {subStep < 4 && (
        <div className="flex gap-2 mt-3">
          {subStep > 0 && (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          )}
          <button type="button" onClick={() => {
            const missing: string[] = [];
            if (subStep === 0 && (!total || total <= 0)) missing.push("ยอดรวม");
            if (subStep === 0 && (pctBefore === null || pctBefore === undefined)) missing.push("% ชำระก่อนติดตั้ง");
            if (subStep === 2 && !installDate) missing.push("วันนัดติดตั้ง");
            if (subStep === 3 && !beforeSlipDone) missing.push("กรุณาอัปโหลดสลิปชำระงวดแรก");
            if (subStep === 3 && !lead.order_before_paid) missing.push("ยืนยันรับชำระงวดแรก");
            if (missing.length > 0) { setNextError(missing.join(", ")); return; }
            setNextError(null);
            setSubStep(subStep + 1); scrollToStep();
          }} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
      {subStep === 4 && (
        <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="w-full h-9 mt-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ย้อนกลับ
        </button>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </StepLayout>
  );
}
