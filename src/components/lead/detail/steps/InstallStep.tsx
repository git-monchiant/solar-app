"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/roles";
import type { StepCommonProps } from "./types";
import FallbackImage from "@/components/ui/FallbackImage";
import PaymentSection from "@/components/payment/PaymentSection";
import PaymentSlipsThumbs from "@/components/payment/PaymentSlipsThumbs";
import ErrorPopup from "@/components/ui/ErrorPopup";
import AppointmentRescheduler from "@/components/calendar/AppointmentRescheduler";
import StepLayout from "../StepLayout";
import ReceiptButtons from "../ReceiptButtons";
import SignaturePad from "../SignaturePad";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { compressImage } from "@/lib/utils/compressImage";
import { buildAppointmentFlex } from "@/lib/utils/line-flex";
import { formatTHB as fmt, formatThaiDate as formatDate } from "@/lib/utils/formatters";

const SUB_STEPS = ["นัด", "รูปภาพ", "สรุป คชจ.", "เก็บเงิน", "ส่งมอบ"];

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function InstallStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const { me } = useMe();
  const [subStep, setSubStep] = useSubStep(`installSubStep_${lead.id}`, lead.install_confirmed ? 1 : 0, SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(lead.install_photos ? lead.install_photos.split(",").filter(Boolean) : []);
  const [note, setNote] = useState(lead.install_note || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraCost, setExtraCost] = useState<number>(lead.install_extra_cost || 0);
  const [extraNote, setExtraNote] = useState(lead.install_extra_note || "");
  const [afterSlipDone, setAfterSlipDone] = useState(!!lead.order_after_slip);
  const [rescheduling, setRescheduling] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(lead.install_customer_signature_url);
  const [actualDate, setActualDate] = useState<string>(
    lead.install_actual_date ? String(lead.install_actual_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  // Auto-save note + extras. Removed the `state !== "active"` gate because the
  // editable form is sometimes still mounted (e.g. expanded done view) and a
  // user typing there expects the save to land regardless. Initial-mount fires
  // once with current values which is a no-op against unchanged DB rows.
  const flushSave = useCallback(() => {
    return apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_note: note || null, install_extra_note: extraNote || null, install_extra_cost: extraCost || null }),
    }).catch(console.error);
  }, [lead.id, note, extraNote, extraCost]);
  useEffect(() => {
    const t = setTimeout(flushSave, 800);
    return () => clearTimeout(t);
  }, [flushSave]);

  const pctBefore = lead.order_pct_before ?? 100;
  const orderTotal = lead.order_total || 0;
  const depositPaid = lead.pre_total_price || 0;
  const netDue = Math.max(0, orderTotal - depositPaid);
  // Paid amount across all confirmed per-installment payments.
  const [paidAmount, setPaidAmount] = useState(0);
  useEffect(() => {
    apiFetch(`/api/payments?lead_id=${lead.id}`)
      .then((rows: Array<{ slip_field: string; confirmed_at: string | null; amount: number }>) => {
        const sum = rows
          .filter(r => r.confirmed_at && /^order_installment_\d+$/.test(r.slip_field))
          .reduce((s, r) => s + Number(r.amount || 0), 0);
        setPaidAmount(sum);
      })
      .catch(console.error);
  }, [lead.id]);
  const remainingAmount = Math.max(0, netDue - paidAmount);
  // Legacy after-amount calc — only used by the InstallStep PaymentSection
  // (legacy "งวด 2" slot). Kept for backward compat with existing leads that
  // still have order_pct_before set.
  const afterRaw = pctBefore < 100 ? orderTotal - Math.round(orderTotal * pctBefore / 100) : 0;
  const depositCredit = Math.min(afterRaw, depositPaid);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("lead_id", String(lead.id));
      formData.append("type", "install");
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      if (res.url) {
        const newPhotos = [...photos, res.url];
        setPhotos(newPhotos);
        await apiFetch(`/api/leads/${lead.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ install_photos: newPhotos.join(",") }),
        });
      }
    } finally { setUploading(false); }
  };

  const removePhoto = async (idx: number) => {
    const newPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(newPhotos);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_photos: newPhotos.join(",") || null }),
    });
  };

  const completeDelivery = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ install_note: note || null, install_completed_at: true }),
      });
      await refresh();
    } finally { setSaving(false); }
  };

  const [notifyLine, setNotifyLine] = useState(true);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<null | "ok" | "err">(null);

  const buildInstallMessage = () => {
    if (!lead.install_date) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildAppointmentFlex({
      origin,
      kind: "install",
      name: lead.full_name,
      date: lead.install_date,
      address: lead.installation_address,
      project: lead.project_name,
      packageLabel: lead.package_name,
      documents: [
        "สำเนาบัตรประชาชน",
        "สำเนาทะเบียนบ้าน",
        "บิลค่าไฟฟ้าล่าสุด",
        "หนังสือยินยอมให้ใช้สถานที่ (ถ้าชื่อมิเตอร์ไม่ตรง)",
        "หนังสือมอบอำนาจ (ถ้าให้บริษัทยื่นแทน)",
      ],
    });
  };

  const confirmAppointment = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ install_confirmed: true }),
      });
      if (notifyLine && lead.line_id) {
        const msg = buildInstallMessage();
        if (msg) {
          apiFetch("/api/line/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
          }).catch(console.error);
        }
      }
      setSubStep(1);
      await refresh();
    } finally { setSaving(false); }
  };

  const resendInstallLine = async () => {
    if (!lead.line_id) return;
    const msg = buildInstallMessage();
    if (!msg) return;
    setResending(true);
    setResendResult(null);
    try {
      await apiFetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
      });
      setResendResult("ok");
    } catch {
      setResendResult("err");
    } finally {
      setResending(false);
      setTimeout(() => setResendResult(null), 3000);
    }
  };

  const saveReschedule = async ({ date }: { date: string; slot: string }) => {
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_date: date, install_confirmed: false }),
    });
    setRescheduling(false);
    refresh();
  };

  // PaymentSection writes the payments row + flips order_after_paid itself.
  // Stay on the current sub-step — user clicks "ถัดไป" to proceed.
  const onAfterConfirmed = async () => {
    if (me?.id) {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_after_paid_by: me.id }),
      }).catch(console.error);
    }
    await refresh();
  };

  const closeStep = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          install_completed_at: true,
          status: "warranty",
          install_actual_date: actualDate || null,
          install_completed_by: me?.id ?? null,
        }),
      });
      await refresh();
    } finally { setSaving(false); }
  };

  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const renderDoneContent = () => (
    <>
      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        {lead.install_date && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
            <div className="text-xs font-bold text-gray-400 uppercase mb-0.5">นัดติดตั้ง</div>
            <div className="font-semibold text-gray-800 text-sm">{formatDate(lead.install_date)}</div>
          </div>
        )}
        {lead.install_actual_date && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
            <div className="text-xs font-bold text-gray-400 uppercase mb-0.5">ติดตั้งจริง</div>
            <div className="font-semibold text-gray-800 text-sm">{formatDate(lead.install_actual_date)}</div>
          </div>
        )}
        {lead.install_completed_at && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
            <div className="text-xs font-bold text-emerald-600 uppercase mb-0.5">ส่งมอบ</div>
            <div className="font-semibold text-emerald-700 text-sm">{formatDate(lead.install_completed_at)}</div>
          </div>
        )}
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="border-l-3 border-emerald-400 pl-3">
          <div className="text-xs font-bold text-emerald-600 uppercase mb-1.5">ภาพส่งมอบ ({photos.length})</div>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {photos.map((url, i) => (
              <FallbackImage
                key={i}
                src={url}
                alt=""
                className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-80 transition"
                gallery={photos.map((u, idx) => ({ url: u, label: `ภาพส่งมอบ ${idx + 1} / ${photos.length}` }))}
                galleryIndex={i}
              />
            ))}
          </div>
        </div>
      )}

      {lead.install_note && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">บันทึกการส่งมอบ</div>
          <div className="text-gray-800 whitespace-pre-wrap">{lead.install_note}</div>
        </div>
      )}

      {/* Cost summary */}
      <div className="border-l-3 border-blue-400 pl-3">
        <div className="text-xs font-bold text-blue-600 uppercase mb-1.5">สรุปค่าใช้จ่าย</div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">มูลค่างาน (ใบเสนอราคา)</span>
            <span className="font-mono text-gray-800">{fmt(orderTotal)} ฿</span>
          </div>
          {lead.pre_total_price ? (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ค่าสำรวจ</span>
              <span className="font-mono text-gray-800">{fmt(lead.pre_total_price)} ฿</span>
            </div>
          ) : null}
          {pctBefore < 100 ? (() => {
            const dep = lead.pre_total_price || 0;
            const beforeAmt = Math.round(orderTotal * pctBefore / 100);
            const afterAmt = orderTotal - beforeAmt;
            const credAfter = Math.min(afterAmt, dep);
            const credBefore = Math.min(beforeAmt, dep - credAfter);
            return (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">งวด 1/2 (ก่อนติดตั้ง {pctBefore}%)</span>
                  <span className="font-mono text-gray-800">{fmt(beforeAmt - credBefore)} ฿</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">งวด 2/2 (หลังติดตั้ง)</span>
                  <span className="font-mono text-gray-800">{fmt(afterAmt - credAfter)} ฿</span>
                </div>
              </>
            );
          })() : (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ชำระเต็มจำนวน</span>
              <span className="font-mono text-gray-800">{fmt(Math.max(0, orderTotal - (lead.pre_total_price || 0)))} ฿</span>
            </div>
          )}
          {(lead.install_extra_cost || 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{lead.install_extra_note || "ค่าใช้จ่ายเพิ่มเติม"}</span>
              <span className="font-mono text-gray-800">+{fmt(lead.install_extra_cost || 0)} ฿</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t-2 border-gray-300 pt-2 mt-1">
            <span className="text-gray-900">มูลค่างานรวม</span>
            <span className="font-mono text-emerald-700">{fmt(orderTotal + (lead.install_extra_cost || 0))} ฿</span>
          </div>
        </div>
      </div>

      {/* Slip */}
      {lead.order_after_slip && (
        <div className="border-l-3 border-violet-400 pl-3">
          <div className="text-xs font-bold text-violet-600 uppercase mb-1.5">สลิปหลังติดตั้ง</div>
          <PaymentSlipsThumbs slipUrl={lead.order_after_slip} label="สลิปหลังติดตั้ง" />
        </div>
      )}


      {/* Customer signature */}
      {lead.install_customer_signature_url && (
        <div className="border-l-3 border-emerald-400 pl-3">
          <div className="text-xs font-bold text-emerald-600 uppercase mb-1.5">ลายเซ็นลูกค้า (รับงาน)</div>
          <a href={lead.install_customer_signature_url} target="_blank" rel="noreferrer">
            <FallbackImage src={lead.install_customer_signature_url} alt="ลายเซ็น" className="max-h-40 max-w-full object-contain bg-white rounded-lg border border-gray-200 hover:opacity-80 transition" />
          </a>
        </div>
      )}

      {/* Review */}
      {lead.review_rating ? (
        <div className="border-l-3 border-amber-400 pl-3">
          <div className="text-xs font-bold text-amber-600 uppercase mb-2">คะแนนจากลูกค้า</div>
          <div className="space-y-1.5">
            {[
              { label: "คุณภาพงาน", value: lead.review_quality },
              { label: "การบริการ", value: lead.review_service },
              { label: "ตรงต่อเวลา", value: lead.review_punctuality },
            ].filter(r => r.value).map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-gray-500 text-xs">{r.label}</span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`text-sm ${s <= r.value! ? "text-amber-400" : "text-gray-200"}`}>★</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {lead.review_comment && <div className="text-gray-600 mt-2 text-xs italic">&quot;{lead.review_comment}&quot;</div>}
        </div>
      ) : lead.review_sent ? (
        <div className="text-xs text-gray-400 italic">ส่งแบบประเมินแล้ว — รอลูกค้าให้คะแนน</div>
      ) : null}

      {lead.order_after_paid && (
        <div className="pt-3 border-t border-gray-100">
          <ReceiptButtons leadId={lead.id} stage="order_after" fileLabel={`${lead.pre_doc_no || `lead_${lead.id}`}_after`} />
        </div>
      )}
    </>
  );

  if (rescheduling) {
    return (
      <AppointmentRescheduler
        title="เลื่อนนัดติดตั้ง"
        currentDate={lead.install_date}
        showTimeSlot={false}
        excludeLeadId={lead.id}
        zoneFilter={lead.zone}
        onCancel={() => setRescheduling(false)}
        onSave={saveReschedule}
      />
    );
  }

  return (
    <StepLayout
      state={state}
      subSteps={SUB_STEPS}
      subStep={subStep}
      onSubStepChange={(n) => {
        if (n > subStep) {
          // Same gates as the "ถัดไป" button — keep them in sync.
          if (subStep === 1) {
            const missing: string[] = [];
            if (photos.length === 0) missing.push("รูปภาพการติดตั้ง");
            if (!note.trim()) missing.push("บันทึกการส่งมอบ");
            if (missing.length > 0) { setNextError(missing.join(", ")); return; }
          }
          if (subStep === 3 && (remainingAmount + extraCost) > 0 && !lead.order_after_paid) {
            setNextError("ต้องยืนยันการรับชำระเงินก่อนถึงจะส่งมอบงานได้");
            return;
          }
        }
        setNextError(null);
        setSubStep(n);
      }}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={
        <>
          <span className="text-sm font-semibold text-emerald-700 flex-1">ติดตั้งเสร็จสิ้น{lead.install_completed_at ? ` · ${formatDate(lead.install_completed_at)}` : ""}</span>
          {lead.order_after_paid && (
            <div className="mr-4"><ReceiptButtons leadId={lead.id} stage="order_after" fileLabel={`${lead.pre_doc_no || `lead_${lead.id}`}_after`} compact /></div>
          )}
        </>
      }
      renderDone={renderDoneContent}
    >
      {/* Step 0: นัด — appointment confirmation */}
      {subStep === 0 && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${lead.install_confirmed ? "bg-emerald-50 border-emerald-600/15" : "bg-active-light border-active/20"}`}>
            <svg className={`w-4 h-4 shrink-0 ${lead.install_confirmed ? "text-emerald-600" : "text-active"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
            </svg>
            <div className="flex-1 flex items-baseline gap-1.5 flex-wrap min-w-0">
              <span className={`text-xs font-semibold tracking-wider uppercase ${lead.install_confirmed ? "text-emerald-700/70" : "text-active/70"}`}>
                {lead.install_confirmed ? "ยืนยันแล้ว" : "นัดหมายแล้ว"}
              </span>
              {lead.install_date ? (
                <span className={`text-sm font-bold ${lead.install_confirmed ? "text-emerald-900" : "text-active"}`}>
                  {formatDate(lead.install_date)}
                </span>
              ) : (
                <span className="text-sm text-gray-500 italic">ยังไม่ได้นัด</span>
              )}
            </div>
            <button type="button" onClick={() => setRescheduling(true)} className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border transition-colors ${lead.install_confirmed ? "border-emerald-600/20 text-emerald-700 hover:bg-emerald-100" : "border-active/30 text-active hover:bg-active/10"}`}>
              {lead.install_date ? "Reschedule" : "เลือกวัน"}
            </button>
          </div>
          {!lead.install_confirmed && lead.install_date && (
            <div className="space-y-2">
              {lead.line_id && (
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyLine}
                    onChange={(e) => setNotifyLine(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>ส่งยืนยันนัดติดตั้งทาง LINE</span>
                </label>
              )}
              <button onClick={confirmAppointment} disabled={saving}
                className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
                {saving ? "..." : "ยืนยันนัดติดตั้ง"}
              </button>
            </div>
          )}
          {lead.install_confirmed && lead.line_id && (
            <button
              type="button"
              onClick={resendInstallLine}
              disabled={resending}
              className={`w-full h-10 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                resendResult === "ok" ? "bg-emerald-500 text-white"
                : resendResult === "err" ? "bg-red-500 text-white"
                : "text-gray-700 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {resending ? "กำลังส่ง…"
                : resendResult === "ok" ? "✓ ส่งแล้ว"
                : resendResult === "err" ? "ส่งไม่สำเร็จ"
                : "ส่งยืนยันทาง LINE อีกครั้ง"}
            </button>
          )}
        </div>
      )}

      {/* Step 1: ส่งมอบ */}
      {subStep === 1 && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">ภาพส่งมอบ</label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-2">
              {photos.map((url, i) => (
                <div key={i} className="relative">
                  <FallbackImage
                    src={url}
                    alt=""
                    className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                    gallery={photos.map((u, idx) => ({ url: u, label: `รูปติดตั้ง ${idx + 1} / ${photos.length}` }))}
                    galleryIndex={i}
                  />
                  <button onClick={(e) => { e.stopPropagation(); removePhoto(i); }} className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full text-white flex items-center justify-center text-xs z-10" style={{ minHeight: 0 }}>✕</button>
                </div>
              ))}
            </div>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary cursor-pointer transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
              <span className="text-sm text-gray-500">{uploading ? "กำลังอัพโหลด..." : "ถ่ายรูป / เลือกรูป"}</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(f => uploadPhoto(f)); }} />
            </label>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">บันทึกการส่งมอบ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={() => flushSave()} rows={3} placeholder="หมายเหตุ, รายละเอียดการติดตั้ง..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
          </div>

        </div>
      )}

      {/* Step 2: สรุปค่าใช้จ่าย */}
      {subStep === 2 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">สรุปค่าใช้จ่าย</div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ยอดตามใบเสนอราคา</span>
              <span className="font-bold font-mono text-gray-900">{fmt(orderTotal)} บาท</span>
            </div>
            <div className="flex justify-between text-xs text-emerald-600">
              <span>ชำระแล้ว</span>
              <span className="font-mono">-{fmt(paidAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500 border-t border-gray-200 pt-1.5">
              <span>ยอดที่ต้องจ่าย</span>
              <span className="font-mono">{fmt(Math.max(0, orderTotal - paidAmount))}</span>
            </div>
            {depositPaid > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(depositPaid)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1.5">
              <span className="text-gray-700">ยอดคงค้าง</span>
              <span className={`font-bold font-mono ${remainingAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {fmt(remainingAmount)} บาท
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ค่าใช้จ่ายเพิ่มเติม (บาท)</label>
            <input type="number" min="0" inputMode="numeric" value={extraCost || ""} onChange={e => setExtraCost(Math.max(0, parseFloat(e.target.value) || 0))} onBlur={() => flushSave()} placeholder="0"
              className="w-full h-12 px-3 rounded-lg border border-gray-200 text-lg font-bold font-mono focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">รายละเอียด</label>
            <textarea value={extraNote} onChange={e => setExtraNote(e.target.value)} onBlur={() => flushSave()} rows={2} placeholder="เช่น ค่าวัสดุเพิ่มเติม, ค่าแรงพิเศษ..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
          </div>

          {/* ยอดรวมที่ต้องเก็บ */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-amber-700">ยอดรวมที่ต้องเก็บ</span>
              <span className="text-lg font-bold font-mono text-amber-700">{fmt(remainingAmount + extraCost)} บาท</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: เก็บเงินคงค้าง / ค่าใช้จ่ายเพิ่มเติม */}
      {subStep === 3 && (() => {
        const totalToCollect = remainingAmount + extraCost;
        const extraLabel = extraCost > 0
          ? (extraNote ? `ค่าใช้จ่ายเพิ่มเติม · ${extraNote}` : "ค่าใช้จ่ายเพิ่มเติม")
          : "";
        const title = remainingAmount > 0 && extraCost > 0
          ? `ยอดคงค้าง + ${extraLabel}`
          : extraCost > 0
            ? extraLabel
            : "ยอดคงค้าง";
        const desc = remainingAmount > 0 && extraCost > 0
          ? `ยอดคงค้าง + ${extraLabel}`
          : extraCost > 0
            ? extraLabel
            : "ยอดคงค้าง";
        return (
          <div className="space-y-3">
            {totalToCollect > 0 ? (
              <div className="rounded-lg bg-white border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase">ยอดเก็บเงิน</span>
                  <span className="text-lg font-bold font-mono tabular-nums text-gray-900">{fmt(totalToCollect)} บาท</span>
                </div>
                <PaymentSection
                  paymentTitle={title}
                  amountLabel=""
                  amount={totalToCollect}
                  leadId={lead.id}
                  leadName={lead.full_name}
                  lineId={lead.line_id}
                  slipUrl={lead.order_after_slip}
                  slipField="order_after_slip"
                  stepNo={4}
                  description={desc}
                  docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-${(() => {
                    // Number this "ยอดคงค้าง / ค่าใช้จ่ายเพิ่มเติม" payment as
                    // the next installment after the order plan (งวดที่ N+1).
                    try {
                      const arr = lead.order_installments ? JSON.parse(lead.order_installments) : [];
                      return (Array.isArray(arr) ? arr.length : 0) + 1;
                    } catch { return 1; }
                  })()}` : null}
                  confirmed={!!lead.order_after_paid}
                  onConfirmed={onAfterConfirmed}
                  onUndone={refresh}
                  onVerified={() => setAfterSlipDone(true)}
                  details={[
                    ...(remainingAmount > 0 ? [{ label: "ยอดคงค้าง", value: `฿${fmt(remainingAmount)}` }] : []),
                    ...(extraCost > 0 ? [{ label: extraNote || "ค่าใช้จ่ายเพิ่มเติม", value: `+฿${fmt(extraCost)}` }] : []),
                    { label: "ยอดที่ต้องชำระ", value: `฿${fmt(totalToCollect)}` },
                  ]}
                />
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <div>
                  <div className="text-sm font-semibold text-emerald-700">ไม่มียอดต้องเก็บเพิ่ม</div>
                  <div className="text-xs text-emerald-600 mt-0.5">ลูกค้าชำระครบทุกงวดแล้ว — ถ้ามีค่าใช้จ่ายเพิ่มเติม กรอกที่ขั้นตอน "สรุปค่าใช้จ่าย"</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Step 4: ลงนามรับงาน */}
      {subStep === 4 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลายเซ็นลูกค้า (ยืนยันรับงาน)</div>

          <SignaturePad
            leadId={lead.id}
            fieldName="install_customer_signature_url"
            initialUrl={lead.install_customer_signature_url}
            onSaved={(url) => setSignatureUrl(url)}
          />

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1.5">วันที่ติดตั้งจริง</label>
            <input type="date" value={actualDate} onChange={e => setActualDate(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary" />
          </div>

        </div>
      )}

      {/* Navigation buttons */}
      {lead.install_confirmed && subStep < 4 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          {subStep > 0 ? (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          ) : <span className="hidden md:block md:w-64" />}
          <button type="button" onClick={async () => {
            if (subStep === 1) {
              const missing: string[] = [];
              if (photos.length === 0) missing.push("รูปภาพการติดตั้ง");
              if (!note.trim()) missing.push("บันทึกการส่งมอบ");
              if (missing.length > 0) { setNextError(missing.join(", ")); return; }
            }
            if (subStep === 3 && (remainingAmount + extraCost) > 0 && !lead.order_after_paid) {
              setNextError("ต้องยืนยันการรับชำระเงินก่อนถึงจะส่งมอบงานได้");
              return;
            }
            await flushSave();
            setNextError(null);
            setSubStep(subStep + 1); scrollToStep();
          }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
      {subStep === 4 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            ย้อนกลับ
          </button>
          <button
            onClick={() => {
              if ((remainingAmount + extraCost) > 0 && !lead.order_after_paid) {
                setNextError("ต้องยืนยันการรับชำระเงินก่อนถึงจะส่งมอบงานได้");
                return;
              }
              closeStep();
            }}
            disabled={saving || !signatureUrl}
            className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? "กำลังยืนยัน..." : "ยืนยันส่งมอบงาน"}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </StepLayout>
  );
}
