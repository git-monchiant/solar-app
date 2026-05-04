"use client";

import { useEffect, useRef, useState } from "react";
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
  const [fullscreen, setFullscreen] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [sigSaving, setSigSaving] = useState(false);
  const [actualDate, setActualDate] = useState<string>(
    lead.install_actual_date ? String(lead.install_actual_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const inlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const inlineDrawingRef = useRef(false);
  const fsCanvasRef = useRef<HTMLCanvasElement>(null);
  const fsDrawingRef = useRef(false);
  const [fsHasDrawn, setFsHasDrawn] = useState(false);

  // Auto-save note
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ install_note: note || null, install_extra_note: extraNote || null, install_extra_cost: extraCost || null }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, extraNote, extraCost]);

  const pctBefore = lead.order_pct_before ?? 100;
  const orderTotal = lead.order_total || 0;
  // After-amount net of deposit credit. Deposit deducts from งวด 2 first; if it
  // exceeds งวด 2, the extra credit was already applied to งวด 1 (OrderStep) so
  // งวด 2 just floors at 0 here.
  const afterRaw = pctBefore < 100 ? orderTotal - Math.round(orderTotal * pctBefore / 100) : 0;
  const depositCredit = Math.min(afterRaw, lead.pre_total_price || 0);
  const remainingAmount = Math.max(0, afterRaw - depositCredit);

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

  // Inline canvas setup + load existing signature
  useEffect(() => {
    const c = inlineCanvasRef.current;
    if (!c || state !== "active" || subStep !== 4) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    if (signatureUrl && !hasDrawn) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        setHasDrawn(true);
      };
      img.src = signatureUrl;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, subStep, signatureUrl]);

  const getInlineCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = inlineCanvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  };
  const onInlineDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = inlineCanvasRef.current?.getContext("2d"); if (!ctx) return;
    inlineDrawingRef.current = true;
    const { x, y } = getInlineCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onInlineMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!inlineDrawingRef.current) return;
    const ctx = inlineCanvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = getInlineCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutoSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { autoSaveSignature(); }, 1200);
  };
  const cancelAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };
  useEffect(() => { return () => cancelAutoSave(); }, []);

  const onInlineUp = () => {
    inlineDrawingRef.current = false;
    if (hasDrawn && !sigSaving) scheduleAutoSave();
  };
  const clearInline = () => {
    cancelAutoSave();
    const c = inlineCanvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    if (signatureUrl) {
      setSignatureUrl(null);
      apiFetch(`/api/leads/${lead.id}/signature/install_customer`, { method: "DELETE" }).catch(console.error);
    }
  };

  // Open fullscreen: seed fullscreen canvas from inline (or existing signature URL)
  useEffect(() => {
    if (!fullscreen) return;
    const fs = fsCanvasRef.current;
    if (!fs) return;
    fs.width = window.innerHeight;
    fs.height = window.innerWidth;
    const ctx = fs.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.clearRect(0, 0, fs.width, fs.height);
    setFsHasDrawn(false);
    // Seed: prefer current inline drawing, fall back to saved signatureUrl
    const inline = inlineCanvasRef.current;
    if (inline && hasDrawn) {
      ctx.drawImage(inline, 0, 0, fs.width, fs.height);
    } else if (signatureUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => ctx.drawImage(img, 0, 0, fs.width, fs.height);
      img.src = signatureUrl;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  const fsCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = fsCanvasRef.current!;
    const parent = c.parentElement!;
    const rect = parent.getBoundingClientRect();
    const wcx = rect.left + rect.width / 2;
    const wcy = rect.top + rect.height / 2;
    const vx = e.clientX - wcx;
    const vy = e.clientY - wcy;
    // Inverse rotate(90deg): local = (vy, -vx)
    const lx = vy;
    const ly = -vx;
    const ww = c.offsetWidth;
    const wh = c.offsetHeight;
    const cx = (lx + ww / 2) * (c.width / ww);
    const cy = (ly + wh / 2) * (c.height / wh);
    return { x: cx, y: cy };
  };

  const onFsDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = fsCanvasRef.current?.getContext("2d"); if (!ctx) return;
    fsDrawingRef.current = true;
    const { x, y } = fsCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onFsMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!fsDrawingRef.current) return;
    const ctx = fsCanvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = fsCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!fsHasDrawn) setFsHasDrawn(true);
  };
  const onFsUp = () => { fsDrawingRef.current = false; };
  const onFsClear = () => {
    const c = fsCanvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setFsHasDrawn(false);
    if (signatureUrl) {
      setSignatureUrl(null);
      apiFetch(`/api/leads/${lead.id}/signature/install_customer`, { method: "DELETE" }).catch(console.error);
    }
  };
  // Fullscreen "เสร็จ" → copy fullscreen canvas back to inline, then auto-save + advance
  const onFsDone = () => {
    const fs = fsCanvasRef.current;
    const inline = inlineCanvasRef.current;
    let drew = false;
    if (fs && inline && fsHasDrawn) {
      const ctx = inline.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, inline.width, inline.height);
        ctx.drawImage(fs, 0, 0, inline.width, inline.height);
      }
      setHasDrawn(true);
      drew = true;
    }
    setFullscreen(false);
    if (drew) {
      setTimeout(() => { autoSaveSignature(); }, 50);
    }
  };

  const uploadInlineSignature = async (): Promise<string | null> => {
    const c = inlineCanvasRef.current;
    if (!c || !hasDrawn) return signatureUrl;
    return new Promise((resolve) => {
      c.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        const res = await apiFetch(`/api/leads/${lead.id}/signature/install_customer`, {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });
        resolve(res.url || null);
      }, "image/png");
    });
  };

  const autoSaveSignature = async () => {
    if (sigSaving) return;
    setSigSaving(true);
    try {
      const url = await uploadInlineSignature();
      if (url) setSignatureUrl(url);
    } finally { setSigSaving(false); }
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
          <div className="grid grid-cols-3 gap-2">
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
      onSubStepChange={(n) => { setNextError(null); setSubStep(n); }}
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
            <div className="grid grid-cols-3 gap-2 mb-2">
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
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="หมายเหตุ, รายละเอียดการติดตั้ง..."
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
            {pctBefore < 100 && (<>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ชำระก่อนติดตั้ง {pctBefore}%</span>
                <span>{fmt(Math.round(orderTotal * pctBefore / 100))} {lead.order_before_paid ? "✓" : ""}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>ชำระหลังติดตั้ง</span>
                <span>{fmt(orderTotal - Math.round(orderTotal * pctBefore / 100))}</span>
              </div>
            </>)}
            {lead.pre_total_price && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักค่าสำรวจ</span>
                <span>-{fmt(lead.pre_total_price)}</span>
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
            <input type="number" min="0" inputMode="numeric" value={extraCost || ""} onChange={e => setExtraCost(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0"
              className="w-full h-12 px-3 rounded-lg border border-gray-200 text-lg font-bold font-mono focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">รายละเอียด</label>
            <textarea value={extraNote} onChange={e => setExtraNote(e.target.value)} rows={2} placeholder="เช่น ค่าวัสดุเพิ่มเติม, ค่าแรงพิเศษ..."
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

      {/* Step 3: เก็บเงินคงค้าง */}
      {subStep === 3 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase">ยอดเก็บเงิน</span>
              <span className="text-lg font-bold font-mono tabular-nums text-gray-900">{fmt(remainingAmount + extraCost)} บาท</span>
            </div>
            <PaymentSection
              paymentTitle="ชำระหลังติดตั้ง"
              amountLabel="งวด 2/2"
              amount={remainingAmount + extraCost}
              leadId={lead.id}
              leadName={lead.full_name}
              lineId={lead.line_id}
              slipUrl={lead.order_after_slip}
              slipField="order_after_slip"
              stepNo={4}
              description={extraCost > 0 ? `ชำระหลังติดตั้ง งวด 2/2 + ${extraNote || "ค่าเพิ่มเติม"}` : "ชำระหลังติดตั้ง งวด 2/2"}
              docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-2` : null}
              confirmed={!!lead.order_after_paid}
              onConfirmed={onAfterConfirmed}
              onUndone={refresh}
              onVerified={() => setAfterSlipDone(true)}
              details={[
                { label: "ยอดคงค้าง (งวด 2/2)", value: `฿${fmt(orderTotal - Math.round(orderTotal * pctBefore / 100))}` },
                ...(extraCost > 0 ? [{ label: extraNote || "ค่าใช้จ่ายเพิ่มเติม", value: `+฿${fmt(extraCost)}` }] : []),
                ...(lead.pre_total_price ? [{ label: "หักค่าสำรวจ", value: `-฿${fmt(lead.pre_total_price)}` }] : []),
                { label: "ยอดที่ต้องชำระ", value: `฿${fmt(remainingAmount + extraCost)}` },
              ]}
            />
          </div>
        </div>
      )}

      {/* Step 4: ลงนามรับงาน */}
      {subStep === 4 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลายเซ็นลูกค้า (ยืนยันรับงาน)</div>

          <div className="space-y-2">
            <div className="relative bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ touchAction: "none" }}>
              <canvas
                ref={inlineCanvasRef}
                width={600}
                height={220}
                className="w-full h-44 cursor-crosshair"
                onPointerDown={onInlineDown}
                onPointerMove={onInlineMove}
                onPointerUp={onInlineUp}
                onPointerLeave={onInlineUp}
              />
              {!hasDrawn && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">
                  ให้ลูกค้าเซ็นชื่อที่นี่
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearInline}
                disabled={!hasDrawn}
                className="flex-1 h-10 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                ล้าง
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="flex-1 h-10 rounded-lg text-xs font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
                ขยายเต็มจอ
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1.5">วันที่ติดตั้งจริง</label>
            <input type="date" value={actualDate} onChange={e => setActualDate(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary" />
          </div>

          <button
            onClick={closeStep}
            disabled={saving || (!hasDrawn && !signatureUrl)}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            {saving ? "กำลังยืนยัน..." : "ยืนยันส่งมอบงาน"}
          </button>
        </div>
      )}

      {/* Fullscreen landscape signature pad */}
      {fullscreen && (
        <div className="fixed inset-0 z-[9999] bg-white overflow-hidden" style={{ touchAction: "none" }}>
          <div
            className="absolute"
            style={{
              width: "100vh",
              height: "100vw",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(90deg)",
            }}
          >
            <canvas
              ref={fsCanvasRef}
              className="block w-full h-full cursor-crosshair"
              style={{ touchAction: "none" }}
              onPointerDown={onFsDown}
              onPointerMove={onFsMove}
              onPointerUp={onFsUp}
              onPointerLeave={onFsUp}
            />
            {!fsHasDrawn && !signatureUrl && !hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-base pointer-events-none">
                ให้ลูกค้าเซ็นชื่อที่นี่
              </div>
            )}
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={onFsClear}
                className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 bg-white/90 backdrop-blur hover:bg-white"
              >
                ล้าง
              </button>
              <button
                onClick={() => setFullscreen(false)}
                className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 bg-white/90 backdrop-blur hover:bg-white"
              >
                ยกเลิก
              </button>
              <button
                onClick={onFsDone}
                className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:brightness-110"
              >
                เสร็จ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      {lead.install_confirmed && subStep < 4 && (
        <div className="flex gap-2 mt-3 lg:justify-between">
          {subStep > 0 ? (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 lg:flex-none lg:w-80 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          ) : <span className="hidden lg:block lg:w-80" />}
          <button type="button" onClick={() => {
            setNextError(null);
            setSubStep(subStep + 1); scrollToStep();
          }} className="flex-1 lg:flex-none lg:w-80 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
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
