"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PAYMENT_TYPES, FINANCE_STATUSES } from "@/lib/statuses";
import type { Lead, Package, StepCommonProps } from "./types";
import PreSurveyForm from "./PreSurveyForm";
import CalendarPicker from "@/components/CalendarPicker";

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

const SURVEY_TIME_SLOTS = [
  { value: "morning", label: "เช้า", time: "09:00 - 12:00" },
  { value: "afternoon", label: "บ่าย", time: "13:00 - 16:00" },
];

const RESIDENCE_TYPES = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
  { value: "other", label: "อื่นๆ" },
];

const chipBtn = (selected: boolean) =>
  `h-9 px-3 rounded-lg text-[15px] font-semibold border transition-all cursor-pointer ${
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
    <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">{label}</span>
    <span className="text-sm font-medium text-gray-800">{value}</span>
  </div>
);

interface Props extends StepCommonProps {
  packages: Package[];
  lead: Lead;
}

export default function PreSurveyStep({ lead, state, refresh, packages }: Props) {
  const [regName, setRegName] = useState(lead.full_name || "");
  const [regIdCard, setRegIdCard] = useState(lead.id_card_number || "");
  const [regAddress, setRegAddress] = useState(lead.id_card_address || "");
  const [regHouseNumber, setRegHouseNumber] = useState(lead.installation_address || "");
  const [regProject, setRegProject] = useState(lead.project_name || "");
  const isFirstRegSave = useRef(true);
  useEffect(() => {
    if (isFirstRegSave.current) { isFirstRegSave.current = false; return; }
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: regName || undefined,
          id_card_number: regIdCard || undefined,
          id_card_address: regAddress || undefined,
          installation_address: regHouseNumber || undefined,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
  }, [regName, regIdCard, regAddress, regHouseNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scheduledSurveys, setScheduledSurveys] = useState<{ id: number; full_name: string; survey_date: string; survey_time_slot: string | null }[]>([]);

  useEffect(() => {
    apiFetch("/api/surveys/scheduled")
      .then((data) => setScheduledSurveys(data))
      .catch(console.error);
  }, [lead.id]);

  // date -> { morning, afternoon, total }
  const surveyCountByDate = scheduledSurveys.reduce<Record<string, { morning: number; afternoon: number; total: number }>>((acc, s) => {
    const key = s.survey_date.slice(0, 10);
    if (!acc[key]) acc[key] = { morning: 0, afternoon: 0, total: 0 };
    if (s.survey_time_slot === "morning") acc[key].morning++;
    else if (s.survey_time_slot === "afternoon") acc[key].afternoon++;
    acc[key].total++;
    return acc;
  }, {});

  // Booking form state
  const [bookingPkg, setBookingPkg] = useState(lead.interested_package_id ? String(lead.interested_package_id) : "");
  const [bookingPayment, setBookingPayment] = useState(lead.payment_type ?? "transfer");
  const [paymentTab, setPaymentTab] = useState<"qr" | "link">("qr");
  const [linkCopied, setLinkCopied] = useState(false);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingSaved, setBookingSaved] = useState(false);
  const [confirmingSaved, setConfirmingSaved] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(lead.slip_url ?? null);
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(lead.slip_url ?? null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "verified" | "failed">(lead.slip_url ? "verified" : "idle");
  const [surveyDate, setSurveyDate] = useState<string>(lead.survey_date ? lead.survey_date.slice(0, 10) : "");
  const [surveyTimeSlot, setSurveyTimeSlot] = useState<string>(lead.survey_time_slot ?? "");

  const [lineSending, setLineSending] = useState<string | null>(null);
  const [lineSent, setLineSent] = useState<string | null>(null);
  const [lineConfirmType, setLineConfirmType] = useState<"qr" | "link" | null>(null);


  const sendViaLine = async (type: "qr" | "link") => {
    if (!lead.line_id) return;
    setLineConfirmType(null);
    setLineSending(type);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const payUrl = `${origin}/pay/${lead.id}`;
      const qrFullUrl = `${origin}/api/qr?amount=${DEPOSIT_AMOUNT}&format=full&name=${encodeURIComponent(lead.full_name)}`;
      const messages = type === "qr"
        ? [
            { type: "image", originalContentUrl: qrFullUrl, previewImageUrl: qrFullUrl },
          ]
        : [
            { type: "text", text: `ชำระค่าจอง Survey ${formatPrice(DEPOSIT_AMOUNT)} บาท\n\nลิ้งค์ชำระเงิน:\n${payUrl}` },
          ];
      await apiFetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, messages }),
      });
      setLineSent(type);
      setTimeout(() => setLineSent(null), 3000);
    } catch {
      setLineSent("error");
      setTimeout(() => setLineSent(null), 3000);
    } finally {
      setLineSending(null);
    }
  };

  const hasBooking = !!lead.booking_number;
  const paymentLabel = PAYMENT_TYPES.find(p => p.value === lead.payment_type)?.label;
  const financeConfig = FINANCE_STATUSES.find(f => f.value === lead.finance_status);


  // Generate QR (deposit is always 1000 THB regardless of payment method)
  useEffect(() => {
    apiFetch(`/api/qr?amount=${DEPOSIT_AMOUNT}`)
      .then((data: { qrDataUrl: string }) => setQrDataUrl(data.qrDataUrl))
      .catch(console.error);
  }, []);

  // Auto-save pre-survey fields on change (debounced)
  const isFirstAutosave = useRef(true);
  useEffect(() => {
    if (isFirstAutosave.current) {
      isFirstAutosave.current = false;
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey_date: surveyDate || null,
          survey_time_slot: surveyTimeSlot || null,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyDate, surveyTimeSlot]);

  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slip_url: url }),
      }).catch(console.error);
      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const { is_slip } = await verifyRes.json();
      setVerifyStatus(is_slip ? "verified" : "failed");
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
        body: JSON.stringify({ payment_type: bookingPayment }),
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
        body: JSON.stringify({ status: "survey", survey_date: surveyDate, survey_time_slot: surveyTimeSlot, next_follow_up: null }),
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
        body: JSON.stringify({ payment_type: bookingPayment }),
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
    const acMap = parseAcUnits(lead.pre_ac_units);
    const acTotal = Object.values(acMap).reduce((a, b) => a + b, 0);
    const applianceList = (lead.pre_appliances || "").split(",").filter(Boolean).map(v => APPLIANCES.find(a => a.value === v)?.label || v);
    const roofLabel = ROOF_SHAPES.find(r => r.value === lead.pre_roof_shape)?.label;
    const phaseLabel = ELECTRICAL_PHASES.find(p => p.value === lead.pre_electrical_phase)?.label;
    const batteryLabel = BATTERY_OPTIONS.find(b => b.value === lead.pre_wants_battery)?.label;
    const peakLabel = PEAK_USAGE.find(p => p.value === lead.pre_peak_usage)?.label;
    const residenceLabel = lead.pre_residence_type?.startsWith("other:") ? lead.pre_residence_type.slice(6) : RESIDENCE_TYPES.find(r => r.value === lead.pre_residence_type)?.label;

    return (
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer list-none py-1">
          {lead.survey_date && (
            <span className="text-sm font-bold text-gray-900 leading-tight">
              <span className="block">นัด {new Date(lead.survey_date).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              {lead.survey_time_slot && (
                <span className="block font-mono tabular-nums text-xs text-gray-500">
                  {SURVEY_TIME_SLOTS.find(s => s.value === lead.survey_time_slot)?.time || lead.survey_time_slot}
                </span>
              )}
            </span>
          )}
          <span className="flex-1" />
          {lead.booking_id && (
            <a
              href={`/api/receipt?booking_id=${lead.booking_id}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark shrink-0 mr-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              PDF
            </a>
          )}
          <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>

        <div className="mt-3 pt-3 border-t border-gray-100 space-y-4 text-sm">

          {/* แพ็คเกจที่สนใจ */}
          {(() => {
            const pkgIds = lead.interested_package_ids ? lead.interested_package_ids.split(",").map(Number) : [];
            const bookedId = lead.interested_package_id || lead.booked_package_id;
            const selectedPkgs = pkgIds.length > 0
              ? packages.filter(p => pkgIds.includes(p.id))
              : bookedId ? packages.filter(p => p.id === bookedId) : [];
            return selectedPkgs.length > 0 ? (
              <div className="border-l-3 border-primary pl-3">
                <div className="text-xs font-bold text-primary uppercase mb-1">แพ็คเกจที่สนใจ</div>
                {selectedPkgs.map(p => (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-gray-800">{p.name}</span>
                    <span className="font-semibold text-gray-800 font-mono">{formatPrice(p.price)}</span>
                  </div>
                ))}
                {batteryLabel && (
                  <div className="flex justify-between mt-1 pt-1 border-t border-gray-100">
                    <span className="text-gray-400">แบตเตอรี่</span>
                    <span className="font-semibold text-gray-800">{batteryLabel}</span>
                  </div>
                )}
              </div>
            ) : null;
          })()}

          {/* บ้าน */}
          {residenceLabel && (
            <div className="border-l-3 border-amber-400 pl-3">
              <div className="text-xs font-bold text-amber-600 uppercase mb-1">บ้าน</div>
              <div className="flex justify-between"><span className="text-gray-400">ประเภทบ้าน</span><span className="font-semibold text-gray-800">{residenceLabel}</span></div>
            </div>
          )}

          {/* การใช้ไฟฟ้า */}
          {(phaseLabel || peakLabel || lead.pre_monthly_bill != null) && (
            <div className="border-l-3 border-blue-400 pl-3">
              <div className="text-xs font-bold text-blue-600 uppercase mb-1">การใช้ไฟฟ้า</div>
              <div className="space-y-0.5">
                {lead.pre_monthly_bill != null && <div className="flex justify-between"><span className="text-gray-400">ค่าไฟต่อเดือน</span><span className="font-semibold text-gray-800 font-mono">{formatPrice(lead.pre_monthly_bill)} บาท</span></div>}
                {phaseLabel && <div className="flex justify-between"><span className="text-gray-400">ระบบไฟ</span><span className="font-semibold text-gray-800">{phaseLabel}</span></div>}
                {peakLabel && <div className="flex justify-between"><span className="text-gray-400">ช่วงใช้ไฟสูงสุด</span><span className="font-semibold text-gray-800">{peakLabel}</span></div>}
              </div>
            </div>
          )}

          {/* เครื่องใช้ไฟฟ้า */}
          {(acTotal > 0 || applianceList.length > 0) && (
            <div className="border-l-3 border-violet-400 pl-3">
              <div className="text-xs font-bold text-violet-600 uppercase mb-1">เครื่องใช้ไฟฟ้า</div>
              {acTotal > 0 && (
                <div className="mb-1.5">
                  <span className="text-xs text-gray-400">แอร์ ({acTotal} เครื่อง)</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {AC_BTU_SIZES.filter(b => acMap[b] > 0).map(b => (
                      <span key={b} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-xs font-mono text-violet-700">
                        {b.toLocaleString()} BTU <span className="font-bold">× {acMap[b]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {applianceList.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {applianceList.map(a => (
                    <span key={a} className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600">{a}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* การชำระเงิน · เอกสาร */}
          {(paymentLabel || lead.pre_bill_photo_url || lead.slip_url) && (
            <div className="border-l-3 border-gray-300 pl-3">
              <div className="text-xs font-bold text-gray-400 uppercase mb-1">เงินมัดจำ · เอกสาร</div>
              {paymentLabel && (
                <div className="flex justify-between">
                  <span className="text-gray-400">วิธีชำระ</span>
                  <span className="font-semibold text-emerald-600">{paymentLabel}</span>
                </div>
              )}
              {lead.booking_date && (
                <div className="flex justify-between">
                  <span className="text-gray-400">วันที่ชำระ</span>
                  <span className="font-semibold text-gray-800">{new Date(lead.booking_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              )}
              {lead.booking_price != null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">จำนวนเงิน</span>
                  <span className="font-semibold text-gray-800 font-mono">{formatPrice(lead.booking_price)} บาท</span>
                </div>
              )}
              {(lead.pre_bill_photo_url || lead.slip_url) && (
                <div className="flex gap-3 mt-1.5">
                  {lead.pre_bill_photo_url && (
                    <a href={lead.pre_bill_photo_url} target="_blank" rel="noreferrer">
                      <div className="text-xs text-gray-400 mb-0.5">บิลค่าไฟ</div>
                      <img src={lead.pre_bill_photo_url} alt="Bill" className="h-16 rounded-lg border border-gray-200" />
                    </a>
                  )}
                  {lead.slip_url && (
                    <a href={lead.slip_url} target="_blank" rel="noreferrer">
                      <div className="text-xs text-gray-400 mb-0.5">หลักฐานการชำระเงิน</div>
                      <img src={lead.slip_url} alt="Slip" className="h-16 rounded-lg border border-gray-200" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action */}
          <div className="pt-3 border-t border-gray-100">
            {lead.confirmed ? (
              <a
                href={`/api/receipt?booking_id=${lead.booking_id}`}
                target="_blank"
                className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                ดาวน์โหลดใบเสร็จ
                <span className="text-xs font-medium text-white/60 ml-1">PDF</span>
              </a>
            ) : (
              <>
                <div className="rounded-lg border border-active/15 bg-white/60 p-3 space-y-2.5 mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลจดทะเบียน</div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ชื่อ-นามสกุล</label>
                    <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน</label>
                    <input type="text" inputMode="numeric" maxLength={13} value={regIdCard} onChange={e => setRegIdCard(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก" className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน</label>
                    <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">โครงการ</label>
                    <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm flex items-center text-gray-700">{regProject || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">ที่อยู่ติดตั้ง</label>
                    <textarea value={regHouseNumber} onChange={e => setRegHouseNumber(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await apiFetch(`/api/leads/${lead.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        full_name: regName || undefined,
                        id_card_number: regIdCard || undefined,
                        id_card_address: regAddress || undefined,
                        installation_address: regHouseNumber || undefined,
                      }),
                    });
                    confirmDraftBooking();
                  }}
                  disabled={confirmingSaved || !surveyDate}
                  className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
                >
                  {confirmingSaved ? "กำลังยืนยัน…" : !surveyDate ? "เลือกวันนัดก่อน" : "ยืนยันและเปิดขั้นสำรวจ"}
                </button>
              </>
            )}
          </div>
        </div>
      </details>
    );
  }

  // Active editing state
  if (state !== "active") return null;

  return (
    <div className="space-y-2">
      <PreSurveyForm lead={lead} refresh={refresh} packages={packages} onPackageChange={setBookingPkg} />

      {/* Survey date picker — first appointment */}
      <div className="rounded-lg border border-active/15 bg-white/60 p-4 mt-2">
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">
          Survey Appointment <span className="text-red-500">*</span>
        </label>
        <CalendarPicker
          date={surveyDate}
          timeSlot={surveyTimeSlot}
          onDateChange={setSurveyDate}
          onTimeSlotChange={setSurveyTimeSlot}
          showSurveySlots
          required
        />
        <div className="text-xs text-gray-500 mt-2">นัดครั้งแรก · เลื่อนนัดทำได้ในขั้น Survey</div>
      </div>

      {/* ชำระค่าจอง Survey — QR / Payment Link tabs */}
      <div className="rounded-lg bg-white/60 border border-active/15 p-4 mt-2">
        <label className="text-sm font-semibold text-gray-900 block mb-0.5">ชำระค่าจอง Survey</label>
        <div className="text-xs text-gray-500 mb-3">ค่ามัดจำ {formatPrice(DEPOSIT_AMOUNT)} บาท</div>

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
        {paymentTab === "qr" && !qrDataUrl && (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-active rounded-full animate-spin" />
          </div>
        )}
        {paymentTab === "qr" && (
          <div className="space-y-3">
            <div className="max-w-[280px] mx-auto">
              <img src={`/api/qr?amount=${DEPOSIT_AMOUNT}&format=full&name=${encodeURIComponent(lead.full_name)}&_=${Date.now()}`} alt="Thai QR Payment" className="w-full rounded-xl border border-gray-200" />
            </div>
            <button
              type="button"
              disabled={lineSending === "qr" || !lead.line_id}
              onClick={() => setLineConfirmType("qr")}
              className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
                lineSent === "qr" ? "bg-emerald-500 text-white" : lineSent === "error" ? "bg-red-500 text-white" : !lead.line_id ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
              }`}
            >
              {lineSending === "qr" ? "กำลังส่ง..." : lineSent === "qr" ? "✓ ส่งแล้ว" : lineSent === "error" ? "ส่งไม่สำเร็จ" : !lead.line_id ? "ยังไม่ได้เชื่อม LINE" : "ส่ง QR ให้ลูกค้า"}
            </button>
          </div>
        )}

        {/* Tab content: Payment Link */}
        {paymentTab === "link" && (
          <div className="space-y-3">
            <div className="text-xs text-gray-500">
              ส่งลิ้งค์นี้ให้ลูกค้าเปิดบนมือถือ เพื่อสแกน QR และชำระเงินได้ด้วยตนเอง
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลิ้งค์ชำระเงิน</div>
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
              disabled={lineSending === "link" || !lead.line_id}
              onClick={() => setLineConfirmType("link")}
              className={`w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
                lineSent === "link" ? "bg-emerald-500 text-white" : lineSent === "error" ? "bg-red-500 text-white" : !lead.line_id ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 shadow-primary/20"
              }`}
            >
              {lineSending === "link" ? "กำลังส่ง..." : lineSent === "link" ? "✓ ส่งแล้ว" : lineSent === "error" ? "ส่งไม่สำเร็จ" : !lead.line_id ? "ยังไม่ได้เชื่อม LINE" : "ส่งลิ้งค์ให้ลูกค้า"}
            </button>
          </div>
        )}
      </div>

      {/* Slip upload */}
      <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id="booking-slip" />
          {slipPreview && (
            <div className="relative rounded-xl overflow-hidden border border-gray-200 max-w-[280px] mx-auto mt-2">
              <img src={slipPreview} alt="Slip" className="w-full" />
              <button
                onClick={() => {
                  setSlipPreview(null);
                  setUploadedSlipUrl(null);
                  setVerifyStatus("idle");
                  apiFetch(`/api/leads/${lead.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slip_url: null }),
                  }).catch(console.error);
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
              อัปโหลดสลิปโอนเงิน
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
              ✓ ตรวจสลิปแล้ว
            </div>
          )}
          {verifyStatus === "failed" && (
            <div className="space-y-2">
              <div className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-red-500 flex items-center justify-center">
                ตรวจสลิปไม่ผ่าน
              </div>
              <button
                onClick={() => {
                  setVerifyStatus("idle");
                  setSlipPreview(null);
                  setUploadedSlipUrl(null);
                }}
                className="w-full h-9 rounded-lg text-xs text-gray-600 border border-gray-200"
              >
                ลองอีกครั้ง
              </button>
            </div>
          )}

      {/* Registration info before confirm */}
      {verifyStatus === "verified" && (
        <div className="rounded-lg border border-active/15 bg-white/60 p-3 space-y-2.5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลจดทะเบียน</div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ชื่อ-นามสกุล</label>
            <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน</label>
            <input type="text" inputMode="numeric" maxLength={13} value={regIdCard} onChange={e => setRegIdCard(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก" className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน</label>
            <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">โครงการ</label>
            <input type="text" value={regProject} onChange={e => setRegProject(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ที่อยู่ติดตั้ง</label>
            <textarea value={regHouseNumber} onChange={e => setRegHouseNumber(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
        </div>
      )}

      {/* Confirm actions */}
      {verifyStatus === "verified" && (
        <button
          onClick={async () => {
            await apiFetch(`/api/leads/${lead.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                full_name: regName || undefined,
                id_card_number: regIdCard || undefined,
                id_card_address: regAddress || undefined,
                installation_address: regHouseNumber || undefined,
              }),
            });
            confirmWithSlip();
          }}
          disabled={bookingSaving || !surveyDate || !surveyTimeSlot}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {bookingSaving ? "กำลังบันทึก…" : !surveyDate ? "เลือกวันนัด" : !surveyTimeSlot ? "เลือกช่วงเวลา" : "ยืนยันและเปิดขั้นสำรวจ"}
        </button>
      )}

      {/* LINE send confirm modal */}
      {lineConfirmType && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setLineConfirmType(null)} />
          <div className="relative bg-white rounded-2xl w-[85%] max-w-sm p-5 animate-slide-up text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
            </div>
            <div className="text-base font-bold text-gray-900 mb-1">
              ส่ง{lineConfirmType === "qr" ? " QR" : "ลิ้งค์ชำระเงิน"}ให้ลูกค้า?
            </div>
            <div className="text-sm text-gray-500 mb-4">
              ส่งไปยัง LINE ของ <span className="font-semibold text-gray-700">{lead.full_name}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLineConfirmType(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => sendViaLine(lineConfirmType)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600"
              >
                ส่งเลย
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
