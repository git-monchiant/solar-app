"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";
import PaymentSection from "./PaymentSection";
import LineConfirmModal from "@/components/LineConfirmModal";
import ErrorPopup from "@/components/ErrorPopup";
import { buildPaymentFlex } from "@/lib/line-flex";

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const SUB_STEPS = ["ส่งมอบ", "สรุป คชจ.", "เก็บเงิน", "ประเมิน"];

export default function InstalledStep({ lead, state, refresh }: StepCommonProps) {
  const [subStep, setSubStep] = useState(0);
  const [nextError, setNextError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(lead.install_photos ? lead.install_photos.split(",").filter(Boolean) : []);
  const [note, setNote] = useState(lead.install_note || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraCost, setExtraCost] = useState<number>(lead.install_extra_cost || 0);
  const [extraNote, setExtraNote] = useState(lead.install_extra_note || "");
  const [reviewConfirm, setReviewConfirm] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const [afterSlipDone, setAfterSlipDone] = useState(!!lead.order_after_slip);
  const [afterPaidLocal, setAfterPaidLocal] = useState(!!lead.order_after_paid);

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
  const remainingAmount = pctBefore < 100
    ? orderTotal - Math.round(orderTotal * pctBefore / 100) - (lead.booking_price || 0)
    : 0;

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
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
      refresh();
    } finally { setSaving(false); }
  };

  const confirmAfterPayment = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_after_paid: true }),
      });
      setAfterPaidLocal(true);
    } finally { setSaving(false); }
  };

  const sendReview = async () => {
    setReviewConfirm(false);
    setReviewSending(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const reviewUrl = `${origin}/review/${lead.id}`;
      const messages = [buildPaymentFlex({
        origin, title: "ประเมินการติดตั้ง", amount: 0, name: lead.full_name,
        actionLabel: "ให้คะแนน", actionUrl: reviewUrl,
        note: "ขอบคุณที่ใช้บริการ Sena Solar Energy\nกรุณาให้คะแนนการติดตั้งของเรา",
      })];
      await apiFetch("/api/line/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, messages }),
      });
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_sent: true }),
      });
      refresh();
    } finally { setReviewSending(false); }
  };

  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  if (state === "done") {
    return (
      <div className="space-y-3 text-sm">
        <div className="text-emerald-700 font-semibold">ติดตั้งเสร็จสิ้น</div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          {lead.install_date && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
              <div className="text-xs font-bold text-gray-400 uppercase mb-0.5">นัดติดตั้ง</div>
              <div className="font-semibold text-gray-800 text-sm">{formatDate(lead.install_date)}</div>
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
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-80 transition" />
                </a>
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
          {lead.booking_price ? (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">งวดมัดจำ</span>
              <span className="font-mono text-gray-800">{fmt(lead.booking_price)} ฿</span>
            </div>
          ) : null}
          {pctBefore < 100 ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">งวด 1/2 (ก่อนติดตั้ง {pctBefore}%)</span>
                <span className="font-mono text-gray-800">{fmt(Math.round(orderTotal * pctBefore / 100) - (lead.booking_price || 0))} ฿</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">งวด 2/2 (หลังติดตั้ง)</span>
                <span className="font-mono text-gray-800">{fmt(orderTotal - Math.round(orderTotal * pctBefore / 100))} ฿</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ชำระเต็มจำนวน</span>
              <span className="font-mono text-gray-800">{fmt(orderTotal - (lead.booking_price || 0))} ฿</span>
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
            <a href={lead.order_after_slip} target="_blank" rel="noreferrer">
              <img src={lead.order_after_slip} alt="" className="max-h-48 rounded-lg border border-gray-200 hover:opacity-80 transition" />
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
            {lead.review_comment && <div className="text-gray-600 mt-2 text-xs italic">"{lead.review_comment}"</div>}
          </div>
        ) : lead.review_sent ? (
          <div className="text-xs text-gray-400 italic">ส่งแบบประเมินแล้ว — รอลูกค้าให้คะแนน</div>
        ) : null}
      </div>
    );
  }

  if (state !== "active") return null;

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-3">
        {SUB_STEPS.map((label, i) => {
          const gateCheck = (from: number): string[] => {
            const missing: string[] = [];
            if (from === 0 && photos.length === 0) missing.push("ภาพส่งมอบ");
            if (from === 0 && !note) missing.push("บันทึกการส่งมอบ");
            if (from === 2 && remainingAmount + extraCost > 0 && !afterSlipDone) missing.push("กรุณาอัปโหลดสลิปชำระงวดหลัง");
            if (from === 2 && remainingAmount + extraCost > 0 && !afterPaidLocal) missing.push("ยืนยันรับชำระงวดหลัง");
            return missing;
          };
          const goTo = () => {
            if (i <= subStep) { setNextError(null); setSubStep(i); scrollToStep(); return; }
            const missing = gateCheck(subStep);
            if (missing.length > 0) { setNextError(missing.join(", ")); return; }
            setNextError(null); setSubStep(i); scrollToStep();
          };
          return (
            <button key={i} type="button" onClick={goTo} className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
              <div className={`h-1 w-full rounded-full transition-colors ${i <= subStep ? "bg-active" : "bg-gray-200"}`} />
              <span className={`text-xs font-semibold transition-colors ${i === subStep ? "text-active" : i < subStep ? "text-gray-500" : "text-gray-300"}`}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Step 0: ส่งมอบ */}
      {subStep === 0 && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">ภาพส่งมอบ</label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {photos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200" />
                  <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full text-white flex items-center justify-center text-xs" style={{ minHeight: 0 }}>✕</button>
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

      {/* Step 1: สรุปค่าใช้จ่าย */}
      {subStep === 1 && (
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
            {lead.booking_price && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>หักมัดจำ</span>
                <span>-{fmt(lead.booking_price)}</span>
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
            <input type="number" value={extraCost || ""} onChange={e => setExtraCost(parseFloat(e.target.value) || 0)} placeholder="0"
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

      {/* Step 2: เก็บเงินคงค้าง */}
      {subStep === 2 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase">ยอดเก็บเงิน</span>
              <span className="text-lg font-bold font-mono tabular-nums text-gray-900">{fmt(remainingAmount + extraCost)} บาท</span>
            </div>
            <PaymentSection
              amount={remainingAmount + extraCost}
              leadId={lead.id}
              leadName={lead.full_name}
              lineId={lead.line_id}
              slipUrl={lead.order_after_slip}
              slipField="order_after_slip"
              hideConfirm
              onSlipUploaded={() => setAfterSlipDone(true)}
              paymentTitle="ชำระหลังติดตั้ง"
              details={[
                { label: "ยอดคงค้าง (งวด 2/2)", value: `฿${fmt(orderTotal - Math.round(orderTotal * pctBefore / 100))}` },
                ...(extraCost > 0 ? [{ label: extraNote || "ค่าใช้จ่ายเพิ่มเติม", value: `+฿${fmt(extraCost)}` }] : []),
                ...(lead.booking_price ? [{ label: "หักมัดจำ", value: `-฿${fmt(lead.booking_price)}` }] : []),
                { label: "ยอดที่ต้องชำระ", value: `฿${fmt(remainingAmount + extraCost)}` },
              ]}
            />
            {afterSlipDone && !afterPaidLocal && (
              <button onClick={confirmAfterPayment} disabled={saving}
                className="w-full h-11 mt-3 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
                {saving ? "กำลังยืนยัน..." : "ยืนยันรับชำระเงิน"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: ส่งประเมิน */}
      {subStep === 3 && (
        <div className="space-y-3">
          {!lead.review_sent ? (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-3">
                  <span className="text-3xl">⭐</span>
                </div>
                <div className="text-base font-bold text-gray-900">ส่งแบบประเมินให้ลูกค้า</div>
                <div className="text-sm text-gray-500 mt-1">ส่ง link ประเมินความพึงพอใจทาง LINE</div>
              </div>
              <button
                onClick={() => setReviewConfirm(true)}
                disabled={reviewSending || !lead.line_id}
                className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
                  !lead.line_id ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
                {reviewSending ? "กำลังส่ง..." : !lead.line_id ? "ยังไม่ได้เชื่อม LINE" : "ส่งแบบประเมินให้ลูกค้า"}
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div className="text-base font-bold text-gray-900">ส่งแบบประเมินแล้ว</div>
              <div className="text-sm text-gray-400 mt-1">{lead.review_rating ? "ลูกค้าประเมินเรียบร้อย" : "รอลูกค้าให้คะแนน"}</div>
            </div>
          )}

          <button
            onClick={async () => {
              setSaving(true);
              try {
                await apiFetch(`/api/leads/${lead.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "closed", install_completed_at: true }),
                });
                refresh();
              } finally { setSaving(false); }
            }}
            disabled={saving}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {saving ? "กำลังปิดงาน..." : "ปิดงาน — ติดตั้งเสร็จสิ้น"}
          </button>
        </div>
      )}

      {/* Navigation buttons */}
      {subStep < 3 && (
        <div className="flex gap-2 mt-3">
          {subStep > 0 && (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          )}
          <button type="button" onClick={() => {
            const missing: string[] = [];
            if (subStep === 0 && photos.length === 0) missing.push("ภาพส่งมอบ");
            if (subStep === 0 && !note) missing.push("บันทึกการส่งมอบ");
            if (subStep === 2 && remainingAmount + extraCost > 0 && !afterSlipDone) missing.push("กรุณาอัปโหลดสลิปชำระงวดหลัง");
            if (subStep === 2 && remainingAmount + extraCost > 0 && !afterPaidLocal) missing.push("ยืนยันรับชำระงวดหลัง");
            if (missing.length > 0) { setNextError(missing.join(", ")); return; }
            setNextError(null);
            setSubStep(subStep + 1); scrollToStep();
          }} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
      {subStep === 3 && (
        <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="w-full h-9 mt-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ย้อนกลับ
        </button>
      )}

      {/* LINE confirm modal */}
      {reviewConfirm && (
        <LineConfirmModal
          name={lead.full_name}
          description="ส่งแบบประเมินความพึงพอใจ"
          onCancel={() => setReviewConfirm(false)}
          onConfirm={sendReview}
        />
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
  );
}
