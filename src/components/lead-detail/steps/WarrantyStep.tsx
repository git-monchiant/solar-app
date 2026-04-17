"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps, Package } from "./types";
import ErrorPopup from "@/components/ErrorPopup";

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);

const addYears = (iso: string | null, years: number): string | null => {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return toISO(d);
};

interface Props extends StepCommonProps {
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

export default function WarrantyStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const installedISO = lead.install_completed_at ? lead.install_completed_at.slice(0, 10) : null;
  const defaultStart = lead.warranty_start_date || installedISO || toISO(new Date());

  const [sn, setSn] = useState(lead.warranty_inverter_sn || "");
  const [docNo, setDocNo] = useState(lead.warranty_doc_no || `SSE${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`);
  const [startDate, setStartDate] = useState(defaultStart);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(lead.warranty_customer_signature_url);
  const [nextError, setNextError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const endDate = addYears(startDate, 2);
  const pkg = packages.find(p => p.id === (lead.booked_package_id || lead.interested_package_id));
  const hasBattery = !!pkg?.has_battery;

  // Auto-save SN / doc no / start date
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_inverter_sn: sn || null,
          warranty_doc_no: docNo || null,
          warranty_start_date: startDate || null,
          warranty_end_date: endDate,
        }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sn, docNo, startDate]);

  // Canvas setup
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || state !== "active") return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, [state]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };
  const onPointerUp = () => { drawingRef.current = false; };
  const clearSignature = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  const uploadSignature = async (): Promise<string | null> => {
    const c = canvasRef.current; if (!c || !hasDrawn) return signatureUrl;
    return new Promise((resolve) => {
      c.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        const fd = new FormData();
        fd.append("file", new File([blob], `sig_${lead.id}.png`, { type: "image/png" }));
        fd.append("filename", `warranty_sig_${lead.id}`);
        const res = await apiFetch("/api/upload", { method: "POST", body: fd });
        resolve(res.url || null);
      }, "image/png");
    });
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const url = hasDrawn ? await uploadSignature() : signatureUrl;
      if (url) setSignatureUrl(url);
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_inverter_sn: sn || null,
          warranty_doc_no: docNo || null,
          warranty_start_date: startDate || null,
          warranty_end_date: endDate,
          warranty_customer_signature_url: url || null,
        }),
      });
      refresh();
    } finally { setSaving(false); }
  };

  const issueWarranty = async () => {
    const missing: string[] = [];
    if (!sn) missing.push("Inverter Serial Number");
    if (!docNo) missing.push("เลขที่เอกสาร");
    if (!startDate) missing.push("วันเริ่มประกัน");
    if (!hasDrawn && !signatureUrl) missing.push("ลายเซ็นลูกค้า");
    if (missing.length > 0) { setNextError(missing.join(", ")); return; }

    setIssuing(true);
    try {
      const url = hasDrawn ? await uploadSignature() : signatureUrl;
      if (url) setSignatureUrl(url);
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_inverter_sn: sn,
          warranty_doc_no: docNo,
          warranty_start_date: startDate,
          warranty_end_date: endDate,
          warranty_customer_signature_url: url,
          warranty_doc_url: `/api/warranty/${lead.id}`,
          warranty_issued_at: true,
          status: "gridtie",
        }),
      });
      refresh();
    } finally { setIssuing(false); }
  };

  if (state === "done") {
    return (
      <div className="text-sm">
        <div onClick={() => onToggle?.()} className="flex items-center gap-2 py-1 cursor-pointer">
          <span className="text-sm font-semibold text-emerald-700">
            ออกใบรับประกัน · {lead.warranty_doc_no}
          </span>
          <span className="flex-1" />
          <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
        {expanded && (
          <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="เลขที่เอกสาร" value={lead.warranty_doc_no} />
              <Info label="Inverter SN" value={lead.warranty_inverter_sn} mono />
              <Info label="เริ่มประกัน" value={formatDate(lead.warranty_start_date)} />
              <Info label="สิ้นสุด" value={formatDate(lead.warranty_end_date)} />
            </div>
            {lead.warranty_doc_url && (
              <a
                href={lead.warranty_doc_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                ดูไฟล์ PDF
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  if (state !== "active") return null;

  const previewUrl = `/warranty/${lead.id}`;
  const pdfUrl = `/api/warranty/${lead.id}`;

  return (
    <div className="space-y-3">
      {/* Doc no */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขที่เอกสาร</label>
        <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="SSE250045"
          className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
      </div>

      {/* Inverter SN */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">Inverter Serial Number</label>
        <input value={sn} onChange={e => setSn(e.target.value)} placeholder="HW1234567890"
          className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เริ่มประกัน</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">สิ้นสุด (+2 ปี)</label>
          <input value={endDate ? formatDate(endDate) : ""} readOnly
            className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600" />
        </div>
      </div>

      {/* Package summary */}
      {pkg && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
          <div className="text-gray-400 font-bold uppercase tracking-wider text-[10px] mb-1">Package</div>
          <div className="flex justify-between"><span className="text-gray-500">ขนาด</span><span className="font-semibold">{pkg.kwp} kWp</span></div>
          <div className="flex justify-between"><span className="text-gray-500">แผง</span><span className="font-semibold">{pkg.solar_panels} × {pkg.panel_watt}W</span></div>
          <div className="flex justify-between"><span className="text-gray-500">อินเวอร์เตอร์</span><span className="font-semibold">{pkg.inverter_brand} {pkg.inverter_kw}kW</span></div>
          {hasBattery && <div className="flex justify-between"><span className="text-gray-500">แบตเตอรี่</span><span className="font-semibold">{pkg.battery_brand} {pkg.battery_kwh}kWh</span></div>}
          <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-200 mt-1">Template: {hasBattery ? "พร้อมแบตเตอรี่" : "Grid-tie ไม่มีแบต"}</div>
        </div>
      )}

      {/* Signature */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลายเซ็นลูกค้า</label>
          {(hasDrawn || signatureUrl) && (
            <button type="button" onClick={clearSignature} className="text-xs text-red-500 hover:text-red-600" style={{ minHeight: 0 }}>ล้าง</button>
          )}
        </div>
        {signatureUrl && !hasDrawn && (
          <div className="mb-2 p-2 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
            <img src={signatureUrl} alt="signature" className="max-h-20" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full h-[150px] rounded-lg border-2 border-dashed border-gray-300 bg-white cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        <div className="text-[11px] text-gray-400 mt-1">ให้ลูกค้าเซ็นในกรอบด้านบน</div>
      </div>

      {/* Preview / Action */}
      <div className="grid grid-cols-2 gap-2">
        <a href={previewUrl} target="_blank" rel="noreferrer"
          className="h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          ดูตัวอย่าง
        </a>
        <a href={pdfUrl} target="_blank" rel="noreferrer"
          className="h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          ดู PDF
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={saveDraft} disabled={saving}
          className="h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {saving ? "กำลังบันทึก..." : "บันทึกร่าง"}
        </button>
        <button type="button" onClick={issueWarranty} disabled={issuing}
          className="h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
          {issuing ? "กำลังออกเอกสาร..." : "ออกเอกสาร & ถัดไป"}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
    </div>
  );
}
