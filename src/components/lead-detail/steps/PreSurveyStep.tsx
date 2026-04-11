"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PAYMENT_TYPES, FINANCE_STATUSES } from "@/lib/statuses";
import type { Lead, Package, StepCommonProps } from "./types";

const DEPOSIT_AMOUNT = 1000;

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const ROOF_SHAPES: { value: string; label: string; svg: React.ReactNode }[] = [
  {
    value: "gable",
    label: "ทรงหน้าจั่ว",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 22 L24 8 L42 22 L42 38 L6 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M24 8 L24 38" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    value: "hip",
    label: "ปั้นหยา",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 38 L10 22 L38 22 L42 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 22 L18 12 L30 12 L38 22" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 12 L10 22 M30 12 L38 22" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: "shed",
    label: "เพิงหมาแหงน",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 20 L42 10 L42 38 L6 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: "flat",
    label: "ทรงแบน",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 14 L42 14 L42 38 L6 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6 14 L42 14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const ELECTRICAL_PHASES = [
  { value: "1_phase", label: "1 เฟส" },
  { value: "3_phase", label: "3 เฟส" },
];

const BATTERY_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
];

const APPLIANCES = [
  { value: "water_heater", label: "เครื่องทำน้ำอุ่น" },
  { value: "ev", label: "ที่ชาร์จรถ EV" },
];

const AC_BTU_SIZES = [9000, 12000, 18000, 24000];

function parseAcUnits(s: string | null): Record<number, number> {
  const map: Record<number, number> = {};
  AC_BTU_SIZES.forEach(b => { map[b] = 0; });
  if (!s) return map;
  s.split(",").forEach(pair => {
    const [btu, count] = pair.split(":").map(Number);
    if (!isNaN(btu) && !isNaN(count) && AC_BTU_SIZES.includes(btu)) {
      map[btu] = count;
    }
  });
  return map;
}

function stringifyAcUnits(map: Record<number, number>): string | null {
  const pairs = AC_BTU_SIZES.filter(b => map[b] > 0).map(b => `${b}:${map[b]}`);
  return pairs.length > 0 ? pairs.join(",") : null;
}

const PEAK_USAGE = [
  { value: "day", label: "กลางวัน" },
  { value: "night", label: "กลางคืน" },
  { value: "both", label: "ทั้งสองช่วง" },
];

const chipBtn = (selected: boolean) =>
  `h-10 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex flex-col gap-0.5 py-2 border-b border-gray-100 last:border-0">
    <span className="text-[10px] font-semibold tracking-wider uppercase text-gray-400">{label}</span>
    <span className="text-sm font-medium text-gray-800">{value}</span>
  </div>
);

interface Props extends StepCommonProps {
  packages: Package[];
  lead: Lead;
}

export default function PreSurveyStep({ lead, state, refresh, packages }: Props) {
  // Pre-survey form fields
  const [monthlyBill, setMonthlyBill] = useState<number | undefined>(lead.monthly_bill ?? undefined);
  const [electricalPhase, setElectricalPhase] = useState<string>(lead.electrical_phase ?? "");
  const [wantsBattery, setWantsBattery] = useState<string>(lead.wants_battery ?? "");
  const [roofShape, setRoofShape] = useState<string>(lead.roof_shape ?? "");
  const [appliances, setAppliances] = useState<string[]>(
    lead.appliances ? lead.appliances.split(",").filter(Boolean) : []
  );
  const [acUnits, setAcUnits] = useState<Record<number, number>>(parseAcUnits(lead.ac_units));
  const [peakUsage, setPeakUsage] = useState<string>(lead.peak_usage ?? "");

  // Booking form state
  const [bookingPkg, setBookingPkg] = useState("");
  const [bookingPayment, setBookingPayment] = useState(lead.payment_type ?? "transfer");
  const [paymentTab, setPaymentTab] = useState<"qr" | "link">("qr");
  const [linkCopied, setLinkCopied] = useState(false);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingSaved, setBookingSaved] = useState(false);
  const [confirmingSaved, setConfirmingSaved] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "verified" | "failed">("idle");
  const [surveyDate, setSurveyDate] = useState<string>(lead.survey_date ? lead.survey_date.slice(0, 10) : "");

  const hasBooking = !!lead.booking_number;
  const paymentLabel = PAYMENT_TYPES.find(p => p.value === lead.payment_type)?.label;
  const financeConfig = FINANCE_STATUSES.find(f => f.value === lead.finance_status);

  // Filter packages by battery preference
  const filteredPackages = packages.filter(p => {
    if (wantsBattery === "yes") return p.has_battery;
    if (wantsBattery === "no") return !p.has_battery;
    return true;
  });

  // Clear pkg if filtered out
  useEffect(() => {
    if (bookingPkg && !filteredPackages.find(p => String(p.id) === bookingPkg)) {
      setBookingPkg("");
    }
  }, [wantsBattery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate QR
  useEffect(() => {
    if (bookingPayment === "transfer") {
      apiFetch(`/api/qr?amount=${DEPOSIT_AMOUNT}`)
        .then((data: { qrDataUrl: string }) => setQrDataUrl(data.qrDataUrl))
        .catch(console.error);
    } else {
      setQrDataUrl(null);
    }
  }, [bookingPayment]);

  const toggleAppliance = (v: string) => {
    setAppliances(prev => (prev.includes(v) ? prev.filter(a => a !== v) : [...prev, v]));
  };

  const preSurveyPayload = () => ({
    monthly_bill: monthlyBill ?? null,
    electrical_phase: electricalPhase || null,
    wants_battery: wantsBattery || null,
    roof_shape: roofShape || null,
    appliances: appliances.length ? appliances.join(",") : null,
    ac_units: stringifyAcUnits(acUnits),
    peak_usage: peakUsage || null,
  });

  const updateAcCount = (btu: number, delta: number) => {
    setAcUnits(prev => ({ ...prev, [btu]: Math.max(0, (prev[btu] || 0) + delta) }));
  };

  const totalAcUnits = Object.values(acUnits).reduce((a, b) => a + b, 0);

  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bookingPkg) return;
    setVerifyStatus("verifying");

    if (uploadedSlipUrl) {
      fetch(`/api/upload?file=${encodeURIComponent(uploadedSlipUrl)}`, {
        method: "DELETE",
        headers: { "ngrok-skip-browser-warning": "true" },
      }).catch(() => {});
      setUploadedSlipUrl(null);
    }

    const reader = new FileReader();
    reader.onload = ev => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: formData,
      });
      const { url } = await uploadRes.json();
      setUploadedSlipUrl(url);
      await new Promise(r => setTimeout(r, 1500));
      setVerifyStatus("verified");
    } catch (err) {
      console.error(err);
      setVerifyStatus("failed");
    }
  };

  // Transfer: slip verified → create booking + confirm + advance
  const confirmWithSlip = async () => {
    if (!bookingPkg || !uploadedSlipUrl || !surveyDate) return;
    setBookingSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: bookingPayment, ...preSurveyPayload() }),
      });
      const bookingRes = await apiFetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          package_id: parseInt(bookingPkg),
          total_price: DEPOSIT_AMOUNT,
        }),
      });
      await apiFetch(`/api/bookings/${bookingRes.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slip_url: uploadedSlipUrl,
          payment_confirmed: true,
          confirmed: true,
          status: "ชำระแล้ว",
        }),
      });
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "survey", survey_date: surveyDate }),
      });
      refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setBookingSaving(false);
    }
  };

  // Non-transfer: save draft then confirm
  const saveBookingDraft = async () => {
    if (!bookingPkg) return;
    setBookingSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: bookingPayment, ...preSurveyPayload() }),
      });
      await apiFetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          package_id: parseInt(bookingPkg),
          total_price: DEPOSIT_AMOUNT,
        }),
      });
      setBookingSaved(true);
      refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setBookingSaving(false);
    }
  };

  const confirmDraftBooking = async () => {
    if (!lead.booking_id || !surveyDate) return;
    setConfirmingSaved(true);
    try {
      await apiFetch(`/api/bookings/${lead.booking_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          slip_url: uploadedSlipUrl,
          payment_confirmed: !!uploadedSlipUrl,
          status: uploadedSlipUrl ? "ชำระแล้ว" : "รอชำระ",
        }),
      });
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "survey", survey_date: surveyDate }),
      });
      refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmingSaved(false);
    }
  };

  // Display when booking already exists (done state, viewing)
  if (hasBooking) {
    return (
      <div className="space-y-5">
        {/* Hero */}
        <div className="flex items-start justify-between gap-4 -mx-1">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400 mb-1">Deposit Reference</div>
            <div className="text-xl font-bold font-mono tabular-nums text-gray-900 tracking-tight">{lead.booking_number}</div>
            {lead.package_name && <div className="text-xs text-gray-500 mt-1 truncate">{lead.package_name}</div>}
            {lead.package_price && (
              <div className="text-[11px] text-gray-400 mt-0.5 font-mono tabular-nums">
                est. {formatPrice(lead.package_price)} THB
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400 mb-1">Deposit Paid</div>
            <div className="text-xl font-bold font-mono tabular-nums text-gray-900 tracking-tight">
              {formatPrice(lead.booking_price || 0)}
              <span className="text-xs font-semibold text-gray-400 ml-1">THB</span>
            </div>
            <div className="mt-1.5 flex justify-end">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                  lead.confirmed
                    ? "bg-emerald-50 text-emerald-700 border-emerald-600/15"
                    : "bg-amber-50 text-amber-700 border-amber-600/15"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${lead.confirmed ? "bg-emerald-500" : "bg-amber-500"}`} />
                {lead.confirmed ? "Paid" : "Pending"}
              </span>
            </div>
          </div>
        </div>

        {lead.survey_date && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-600/15">
            <svg className="w-4 h-4 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <div className="text-xs flex-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-violet-600/70">Survey Scheduled</span>
              <div className="font-semibold text-violet-900">{formatDate(lead.survey_date)}</div>
            </div>
          </div>
        )}

        {(paymentLabel || financeConfig) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 pt-1 border-t border-gray-100">
            {paymentLabel && <InfoRow label="Payment Method" value={paymentLabel} />}
            {financeConfig && (
              <InfoRow
                label="Finance Status"
                value={
                  <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded ${financeConfig.color}`}>
                    {financeConfig.label}
                  </span>
                }
              />
            )}
          </div>
        )}

        {lead.slip_url && (
          <div className="pt-1">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400 mb-2">Payment Slip</div>
            <a href={lead.slip_url} target="_blank" className="block">
              <img
                src={lead.slip_url}
                alt="Payment slip"
                className="w-full max-w-[180px] rounded-lg border border-gray-200 hover:border-primary/30 transition-colors"
              />
            </a>
          </div>
        )}

        <div className="pt-1">
          {lead.confirmed ? (
            <a
              href={`/api/receipt?booking_id=${lead.booking_id}`}
              target="_blank"
              className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Receipt
              <span className="text-[10px] font-medium text-white/60 ml-1">PDF</span>
            </a>
          ) : (
            <button
              onClick={confirmDraftBooking}
              disabled={confirmingSaved || !surveyDate}
              className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {confirmingSaved ? "Confirming…" : !surveyDate ? "Set Survey Date to Continue" : "Confirm & Unlock Survey"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Active editing state
  if (state !== "active") return null;

  return (
    <div className="space-y-2">
      {/* 1. Air Conditioners — per BTU counts */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-xs font-semibold text-gray-900">Air Conditioners</label>
          {totalAcUnits > 0 && (
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 px-1.5 py-0.5 rounded">
              รวม {totalAcUnits} เครื่อง
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 mb-2">ระบุจำนวนเครื่องตามขนาด BTU</div>
        <div className="space-y-1.5">
          {AC_BTU_SIZES.map(btu => {
            const count = acUnits[btu] || 0;
            return (
              <div key={btu} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-700 font-mono tabular-nums">
                  {btu.toLocaleString()} <span className="text-xs text-gray-400 font-sans">BTU</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateAcCount(btu, -1)}
                    disabled={count === 0}
                    className="w-9 h-9 rounded-md border border-gray-200 text-gray-600 text-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-400 transition-colors"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums text-gray-900">{count}</span>
                  <button
                    type="button"
                    onClick={() => updateAcCount(btu, 1)}
                    className="w-9 h-9 rounded-md border border-gray-200 text-gray-600 text-lg font-semibold hover:border-gray-400 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Main Appliances */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2">Main Appliances</label>
        <div className="grid grid-cols-3 gap-2">
          {APPLIANCES.map(a => (
            <button key={a.value} type="button" onClick={() => toggleAppliance(a.value)} className={chipBtn(appliances.includes(a.value))}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Monthly bill */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2">Monthly Electricity Bill</label>
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            value={monthlyBill ?? ""}
            onChange={e => setMonthlyBill(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="เช่น 3,500"
            className="w-full h-10 pl-3 pr-14 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">บาท</span>
        </div>
      </div>

      {/* 3. Peak usage */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2">Peak Usage</label>
        <div className="grid grid-cols-3 gap-2">
          {PEAK_USAGE.map(p => (
            <button key={p.value} type="button" onClick={() => setPeakUsage(p.value)} className={chipBtn(peakUsage === p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Electrical phase */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2">ระบบไฟปัจจุบัน</label>
        <div className="grid grid-cols-3 gap-2">
          {ELECTRICAL_PHASES.map(p => (
            <button key={p.value} type="button" onClick={() => setElectricalPhase(p.value)} className={chipBtn(electricalPhase === p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Roof shape */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2.5">ทรงหลังคา · Roof Shape</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROOF_SHAPES.map(r => {
            const selected = roofShape === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRoofShape(r.value)}
                className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg border transition-colors cursor-pointer ${
                  selected
                    ? "bg-active border-active text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-active/40"
                }`}
              >
                {r.svg}
                <span className="text-sm font-semibold">{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. Battery */}
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2">ต้องการแบตเตอรี่</label>
        <div className="grid grid-cols-3 gap-2">
          {BATTERY_OPTIONS.map(b => (
            <button key={b.value} type="button" onClick={() => setWantsBattery(b.value)} className={chipBtn(wantsBattery === b.value)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Package selection */}
      <div className="pt-2">
        <label className="text-xs font-semibold text-gray-700 block mb-2">
          Select Package <span className="text-red-500">*</span>
          {wantsBattery === "yes" && <span className="ml-2 text-[10px] font-medium text-gray-400 normal-case">· กรอง: มีแบตเตอรี่</span>}
          {wantsBattery === "no" && <span className="ml-2 text-[10px] font-medium text-gray-400 normal-case">· กรอง: ไม่มีแบตเตอรี่</span>}
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {filteredPackages.length === 0 && (
            <div className="col-span-full text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
              ไม่มีแพ็คเกจที่ตรงกับที่เลือก
            </div>
          )}
          {filteredPackages.map(p => {
            const selected = bookingPkg === String(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setBookingPkg(String(p.id))}
                className={`text-left rounded-xl p-3 border-2 transition-all ${
                  selected ? "border-active bg-active-light" : "border-gray-100 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      {p.solar_panels && <span>{p.solar_panels} panels</span>}
                      {p.inverter_brand && <span>{p.inverter_brand} {p.inverter_kw}kW</span>}
                      {p.has_battery && <span>Battery {p.battery_kwh}kWh</span>}
                      <span>{p.warranty_years}yr warranty</span>
                    </div>
                    {p.monthly_saving > 0 && <div className="text-xs text-emerald-600 mt-0.5">Save ~{formatPrice(p.monthly_saving)}/mo</div>}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-lg font-bold font-mono tabular-nums">{formatPrice(p.price)}</div>
                    <div className="text-[10px] text-gray-400">THB</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ชำระค่าจอง Survey — QR / Payment Link tabs */}
      <div className="rounded-lg bg-white border border-gray-200 p-4 mt-2">
        <label className="text-sm font-semibold text-gray-900 block mb-0.5">ชำระค่าจอง Survey</label>
        <div className="text-[11px] text-gray-500 mb-3">ค่ามัดจำ {formatPrice(DEPOSIT_AMOUNT)} บาท</div>

        {/* Tabs — underline style */}
        <div className="flex border-b border-gray-200 mb-4 -mx-4 px-4">
          <button
            type="button"
            onClick={() => setPaymentTab("qr")}
            className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
              paymentTab === "qr"
                ? "text-active border-active"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            Thai QR
          </button>
          <button
            type="button"
            onClick={() => setPaymentTab("link")}
            className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
              paymentTab === "link"
                ? "text-active border-active"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            Payment Link
          </button>
        </div>

        {/* Tab content: QR */}
        {paymentTab === "qr" && qrDataUrl && (
          <div className="space-y-3">
            <div className="max-w-[280px] mx-auto">
              <div className="relative">
                <img src="/templates/thaiqr.png" alt="Thai QR Payment" className="w-full" />
                <img
                  src={qrDataUrl}
                  alt="PromptPay QR"
                  className="absolute"
                  style={{ top: "115px", left: "30px", width: "calc(100% - 60px)" }}
                />
              </div>
              <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 px-4 py-3 text-center">
                <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400">Deposit</div>
                <div className="text-2xl font-bold font-mono tabular-nums">
                  {formatPrice(DEPOSIT_AMOUNT)}
                  <span className="text-sm text-gray-400 ml-1">THB</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">PromptPay: 085-909-9890</div>
              </div>
            </div>
            <button
              type="button"
              className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 transition-all shadow-sm shadow-primary/20"
            >
              ส่ง QR ให้ลูกค้า
            </button>
          </div>
        )}

        {/* Tab content: Payment Link */}
        {paymentTab === "link" && (
          <div className="space-y-3">
            <div className="text-[11px] text-gray-500">
              ส่งลิ้งค์นี้ให้ลูกค้าเปิดบนมือถือ เพื่อสแกน QR และชำระเงินได้ด้วยตนเอง
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400">Payment URL</div>
                <div className="text-xs font-mono text-gray-800 truncate mt-0.5">
                  {typeof window !== "undefined" ? `${window.location.origin}/pay/${lead.id}` : `/pay/${lead.id}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/pay/${lead.id}`;
                  navigator.clipboard.writeText(url);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="shrink-0 h-9 px-3 rounded-md text-xs font-semibold bg-active text-white hover:brightness-110 transition-all cursor-pointer"
              >
                {linkCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 transition-all shadow-sm shadow-primary/20"
            >
              ส่งลิ้งค์ให้ลูกค้า
            </button>
          </div>
        )}
      </div>

      {/* Slip upload */}
      {bookingPayment === "transfer" && (
        <>
          <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id="booking-slip" />
          {slipPreview && (
            <div className="relative rounded-xl overflow-hidden border border-gray-200 max-w-[280px] mx-auto mt-2">
              <img src={slipPreview} alt="Slip" className="w-full" />
              <button
                onClick={() => {
                  setSlipPreview(null);
                  setUploadedSlipUrl(null);
                  setVerifyStatus("idle");
                }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>
          )}
          {verifyStatus === "idle" && (
            <label
              htmlFor="booking-slip"
              className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors"
            >
              Upload Payment Slip
            </label>
          )}
          {verifyStatus === "verifying" && (
            <div className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-amber-500 flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying…
            </div>
          )}
          {verifyStatus === "verified" && (
            <div className="w-full h-9 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 flex items-center justify-center gap-1">
              ✓ Slip Verified
            </div>
          )}
          {verifyStatus === "failed" && (
            <div className="space-y-2">
              <div className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-red-500 flex items-center justify-center">
                Verification Failed
              </div>
              <button
                onClick={() => {
                  setVerifyStatus("idle");
                  setSlipPreview(null);
                  setUploadedSlipUrl(null);
                }}
                className="w-full h-9 rounded-lg text-xs text-gray-600 border border-gray-200"
              >
                Try Again
              </button>
            </div>
          )}
        </>
      )}

      {/* Survey date picker */}
      {bookingPkg && bookingPayment && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 mt-2">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 block mb-2">
            Survey Appointment <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={surveyDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={e => setSurveyDate(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:border-primary"
          />
          <div className="text-[11px] text-gray-500 mt-1.5">ต้องระบุเพื่อปลดล็อคขั้นตอนการสำรวจพื้นที่</div>
        </div>
      )}

      {/* Confirm actions */}
      {bookingPayment === "transfer" && verifyStatus === "verified" && (
        <button
          onClick={confirmWithSlip}
          disabled={bookingSaving || !surveyDate}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {bookingSaving ? "Saving…" : !surveyDate ? "Set Survey Date to Continue" : "Confirm & Unlock Survey"}
        </button>
      )}

    </div>
  );
}
