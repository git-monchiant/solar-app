"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PAYMENT_TYPES, FINANCE_STATUSES } from "@/lib/constants/statuses";
import type { Lead, Package, StepCommonProps } from "./types";
import PreSurveyForm from "./PreSurveyForm";
import PaymentSection from "@/components/payment/PaymentSection";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import { validatePreSurvey } from "@/lib/constants/step-validators";
import ErrorPopup from "@/components/ui/ErrorPopup";
import FallbackImage from "@/components/ui/FallbackImage";
import CustomerInfoForm from "@/components/customer/CustomerInfoForm";
import StepLayout from "../StepLayout";
import ReceiptButtons from "../ReceiptButtons";
import { useSubStep } from "@/lib/hooks/useSubStep";

const DEPOSIT_AMOUNT = 1000;

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

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
  expanded?: boolean;
  onToggle?: () => void;
}

export default function PreSurveyStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const [regName, setRegName] = useState(lead.full_name || "");
  const [regIdCard, setRegIdCard] = useState(lead.id_card_number || "");
  const [regAddress, setRegAddress] = useState(lead.id_card_address || "");
  const [regHouseNumber, setRegHouseNumber] = useState(lead.installation_address || "");
  const [regProject, setRegProject] = useState(lead.project_name || "");
  const REG_SUB_STEPS = ["ข้อมูล", "แพ็คเกจ", "นัดสำรวจ", "ชำระเงิน", "ยืนยัน"];
  const [subStep, setSubStep] = useSubStep(`preSurveySubStep_${lead.id}`, 0, REG_SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<Lead>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isFirstRegSave = useRef(true);
  useEffect(() => {
    if (isFirstRegSave.current) { isFirstRegSave.current = false; return; }
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: regName ? regName.slice(0, 200) : undefined,
          id_card_number: regIdCard ? regIdCard.slice(0, 13) : undefined,
          id_card_address: regAddress ? regAddress.slice(0, 500) : undefined,
          installation_address: regHouseNumber ? regHouseNumber.slice(0, 500) : undefined,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
  }, [regName, regIdCard, regAddress, regHouseNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zone, setZone] = useState<string>(lead.zone ?? "");
  const [zones, setZones] = useState<{ id: number; name: string; color: string }[]>([]);
  useEffect(() => { apiFetch("/api/zones").then(setZones).catch(console.error); }, []);
  const [scheduledSurveys, setScheduledSurveys] = useState<{ id: number; full_name: string; survey_date: string; survey_time_slot: string | null }[]>([]);

  useEffect(() => {
    apiFetch("/api/surveys/scheduled")
      .then((data) => setScheduledSurveys(data))
      .catch(console.error);
  }, [lead.id]);

  // date -> { morning, afternoon, total }
  const surveyCountByDate = scheduledSurveys.reduce<Record<string, { morning: number; afternoon: number; total: number }>>((acc, s) => {
    const date = (s as unknown as { event_date?: string; survey_date?: string }).event_date || (s as unknown as { survey_date?: string }).survey_date;
    const slot = (s as unknown as { time_slot?: string; survey_time_slot?: string }).time_slot || (s as unknown as { survey_time_slot?: string }).survey_time_slot;
    if (!date) return acc;
    const key = date.slice(0, 10);
    if (!acc[key]) acc[key] = { morning: 0, afternoon: 0, total: 0 };
    if (slot === "morning") acc[key].morning++;
    else if (slot === "afternoon") acc[key].afternoon++;
    acc[key].total++;
    return acc;
  }, {});

  // Pre-survey form state
  const [selectedPkg, setSelectedPkg] = useState(lead.interested_package_id ? String(lead.interested_package_id) : "");
  const [paymentMethod, setPaymentMethod] = useState(lead.payment_type ?? "transfer");
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmSaved, setConfirmSaved] = useState(false);
  const [confirmingSaved, setConfirmingSaved] = useState(false);
  // Payment verification state — PaymentSection owns upload/verify and calls onVerified(url).
  // url may be "" when KBank authorized the payment but the slip file is unavailable.
  const [slipVerifiedUrl, setSlipVerifiedUrl] = useState<string | null>(lead.pre_slip_url ?? null);
  const [paymentVerified, setPaymentVerified] = useState<boolean>(!!lead.pre_slip_url);
  const [surveyDate, setSurveyDate] = useState<string>(lead.survey_date ? lead.survey_date.slice(0, 10) : "");
  const [surveyTimeSlot, setSurveyTimeSlot] = useState<string>(lead.survey_time_slot ?? "");

  // Pre-Survey step is "done" once status advances past 'pre_survey' (the user
  // submitted the ID-info form at subStep 4, which PATCHes status='survey').
  const hasPreSurveyDone = lead.status !== "pre_survey";
  const hasReceipt = !!lead.pre_doc_no || !!lead.payment_confirmed;
  const paymentLabel = PAYMENT_TYPES.find(p => p.value === lead.payment_type)?.label;
  const financeConfig = FINANCE_STATUSES.find(f => f.value === lead.finance_status);

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


  // subStep 4 final confirm: advance status to 'survey' + save payment_type.
  // Payment row is already written by PaymentSection at subStep 3 (confirm slip),
  // and pre_doc_no is already created by onConfirmed — no need to redo them.
  const confirmWithSlip = async () => {
    if (!selectedPkg || !paymentVerified || !surveyDate) return;
    setConfirmSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_type: paymentMethod,
          status: "survey",
          survey_date: surveyDate,
          survey_time_slot: surveyTimeSlot,
          next_follow_up: null,
        }),
      });
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmSaving(false);
    }
  };

  // Non-transfer: save draft (book only, no payment yet)
  const savePreSurveyDraft = async () => {
    if (!selectedPkg) return;
    setConfirmSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: paymentMethod }),
      });
      await apiFetch(`/api/leads/${lead.id}/book`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: parseInt(selectedPkg), total_price: DEPOSIT_AMOUNT }),
      });
      setConfirmSaved(true);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmSaving(false);
    }
  };

  const confirmDraftPreSurvey = async () => {
    if (!surveyDate) return;
    setConfirmingSaved(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pre_slip_url: slipVerifiedUrl || null,
          payment_confirmed: paymentVerified,
          status: "survey",
          survey_date: surveyDate,
        }),
      });
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmingSaved(false);
    }
  };

  // Display when pre-survey is done (viewing)
  if (hasPreSurveyDone) {
    const acMap = parseAcUnits(lead.pre_ac_units);
    const acTotal = Object.values(acMap).reduce((a, b) => a + b, 0);
    const applianceList = (lead.pre_appliances || "").split(",").filter(Boolean).map(v => APPLIANCES.find(a => a.value === v)?.label || v);
    const roofLabel = ROOF_SHAPES.find(r => r.value === lead.pre_roof_shape)?.label;
    const phaseLabel = ELECTRICAL_PHASES.find(p => p.value === lead.pre_electrical_phase)?.label;
    const batteryLabel = BATTERY_OPTIONS.find(b => b.value === lead.pre_wants_battery)?.label;
    const peakLabel = PEAK_USAGE.find(p => p.value === lead.pre_peak_usage)?.label;
    const residenceLabel = lead.pre_residence_type?.startsWith("other:") ? lead.pre_residence_type.slice(6) : RESIDENCE_TYPES.find(r => r.value === lead.pre_residence_type)?.label;

    const doneHeaderContent = (
      <>
        {lead.survey_date && (
          <span className="text-sm font-bold text-gray-900 leading-tight flex-1">
            <span className="block">นัด {new Date(String(lead.survey_date).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
            {lead.survey_time_slot && (
              <span className="block font-mono tabular-nums text-xs text-gray-500">
                {SURVEY_TIME_SLOTS.find(s => s.value === lead.survey_time_slot)?.time || lead.survey_time_slot}
              </span>
            )}
          </span>
        )}
        {!lead.survey_date && <span className="flex-1" />}
        {hasReceipt && (
          <div className="mr-4"><ReceiptButtons leadId={lead.id} stage="deposit" fileLabel={lead.pre_doc_no || `lead_${lead.id}_deposit`} compact /></div>
        )}
      </>
    );

    const renderDoneContent = () => (<>

          {/* แพ็คเกจที่สนใจ */}
          {(() => {
            const pkgIds = lead.interested_package_ids ? lead.interested_package_ids.split(",").map(Number) : [];
            const bookedId = lead.interested_package_id || lead.pre_package_id;
            const selectedPkgs = pkgIds.length > 0
              ? packages.filter(p => pkgIds.includes(p.id))
              : bookedId ? packages.filter(p => p.id === bookedId) : [];
            return selectedPkgs.length > 0 ? (
              <div className="border-l-3 border-primary pl-3">
                <div className="text-xs font-bold text-primary uppercase mb-1">แพ็คเกจที่สนใจ</div>
                {selectedPkgs.map(p => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-gray-800 flex items-center gap-1.5">
                      {p.name}
                      {p.is_upgrade && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase shrink-0">UPGRADE</span>}
                      <span className="inline-flex items-center gap-0.5 ml-1">
                        <svg className={`w-3 h-3 ${p.has_panel ? "text-amber-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                        <svg className={`w-3 h-3 ${p.has_inverter ? "text-violet-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                        <svg className={`w-3 h-3 ${p.has_battery ? "text-green-500 fill-green-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0021 15.75v-6a2.25 2.25 0 00-2.25-2.25h-15A2.25 2.25 0 001.5 9.75v6A2.25 2.25 0 003.75 18z" /></svg>
                      </span>
                    </span>
                    <span className="font-semibold text-gray-800 font-mono shrink-0">{formatPrice(p.price)}</span>
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
          {(paymentLabel || lead.pre_bill_photo_url || lead.pre_slip_url) && (
            <div className="border-l-3 border-gray-300 pl-3">
              <div className="text-xs font-bold text-gray-400 uppercase mb-1">ค่าสำรวจ · เอกสาร</div>
              {paymentLabel && (
                <div className="flex justify-between">
                  <span className="text-gray-400">วิธีชำระ</span>
                  <span className="font-semibold text-emerald-600">{paymentLabel}</span>
                </div>
              )}
              {lead.pre_booked_at && (
                <div className="flex justify-between">
                  <span className="text-gray-400">วันที่ชำระ</span>
                  <span className="font-semibold text-gray-800">{new Date(String(lead.pre_booked_at).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              )}
              {lead.pre_total_price != null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">จำนวนเงิน</span>
                  <span className="font-semibold text-gray-800 font-mono">{formatPrice(lead.pre_total_price)} บาท</span>
                </div>
              )}
              {(lead.pre_bill_photo_url || lead.pre_slip_url) && (
                <div className="flex gap-3 mt-1.5">
                  {lead.pre_bill_photo_url && (
                    <button type="button" onClick={() => setLightboxUrl(lead.pre_bill_photo_url)} className="text-left">
                      <div className="text-xs text-gray-400 mb-0.5">บิลค่าไฟ</div>
                      <FallbackImage src={lead.pre_bill_photo_url} alt="Bill" className="max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" fallbackLabel="บิลหาย" />
                    </button>
                  )}
                  {lead.pre_slip_url && (
                    <button type="button" onClick={() => setLightboxUrl(lead.pre_slip_url)} className="text-left">
                      <div className="text-xs text-gray-400 mb-0.5">หลักฐานการชำระเงิน</div>
                      <FallbackImage src={lead.pre_slip_url} alt="Slip" className="max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" fallbackLabel="สลิปหาย" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action */}
          <div className="pt-3 border-t border-gray-100">
            {hasReceipt ? (
              <ReceiptButtons leadId={lead.id} stage="deposit" fileLabel={lead.pre_doc_no || `lead_${lead.id}_deposit`} />
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
                    confirmDraftPreSurvey();
                  }}
                  disabled={confirmingSaved || !surveyDate}
                  className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
                >
                  {confirmingSaved ? "กำลังยืนยัน…" : !surveyDate ? "เลือกวันนัดก่อน" : "ยืนยันและเปิดขั้นสำรวจ"}
                </button>
              </>
            )}
          </div>
        </>);

    return (<>
      <StepLayout
        state="done"
        doneHeader={doneHeaderContent}
        renderDone={renderDoneContent}
        expanded={expanded}
        onToggle={onToggle}
      />
      {lightboxUrl && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/70" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl safe-top">✕</button>
          <img src={lightboxUrl} alt="Preview" className="max-w-[90vw] max-h-[78vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
      </>
    );
  }

  const handleSubStepChange = (i: number) => {
    if (i <= subStep) { setNextError(null); setSubStep(i); return; }
    const gates: Record<number, string[]> = {
      0: ["full_name", "phone", "installation_address", "pre_residence_type", "pre_monthly_bill", "pre_peak_usage", "pre_electrical_phase"],
      1: ["pre_wants_battery", "interested_package_ids"],
      2: ["survey_date", "survey_time_slot"],
      3: [],
    };
    const v = validatePreSurvey({ ...lead, ...formDraft, survey_date: surveyDate || lead.survey_date, survey_time_slot: surveyTimeSlot || lead.survey_time_slot });
    const missingHere = v.missing.filter(m => (gates[subStep] || []).includes(m.field));
    if (subStep === 3 && !paymentVerified) missingHere.push({ field: "slip", label: "กรุณาอัปโหลดสลิปชำระเงิน" });
    if (missingHere.length > 0) {
      setNextError(missingHere.map(m => m.label).join(", "));
      return;
    }
    setNextError(null);
    setSubStep(i);
  };

  return (
    <StepLayout
      state={state}
      subSteps={REG_SUB_STEPS}
      subStep={subStep}
      onSubStepChange={handleSubStepChange}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={null}
    >
      {/* Step 1+2: single PreSurveyForm instance, CSS toggle sections */}
      <div className={subStep <= 1 ? "" : "hidden"}>
        <PreSurveyForm lead={lead} refresh={refresh} packages={packages} hidePackages={subStep !== 1} onlyPackages={subStep === 1} onPackageChange={setSelectedPkg} onFormChange={setFormDraft} />
      </div>

      {/* Step 3: นัดสำรวจ */}
      {subStep === 2 && (
        <div className="space-y-2">
        <div className="rounded-lg border border-active/15 bg-white/60 p-4">
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">Zone</label>
          <div className="grid grid-cols-1 gap-2">
            {zones.map(z => (
              <button key={z.id} type="button" onClick={() => {
                setZone(z.name);
                apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: z.name }) }).catch(console.error);
              }} className={`w-full h-10 rounded-lg text-sm font-semibold border transition-all text-left px-4 ${zone === z.name ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}>
                {z.name}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-active/15 bg-white/60 p-4">
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
        </div>
      )}

      {/* Step 4: ชำระเงิน */}
      {subStep === 3 && (
        <div className="rounded-lg bg-white/60 border border-active/15 p-4">
          <PaymentSection
            paymentTitle="ชำระค่าจอง Survey"
            amountLabel="ค่าสำรวจ"
            amount={DEPOSIT_AMOUNT}
            leadId={lead.id}
            leadName={lead.full_name}
            lineId={lead.line_id}
            slipUrl={lead.pre_slip_url ?? null}
            slipField="pre_slip_url"
            paymentNote="ค่าสำรวจพื้นที่ติดตั้ง Solar Rooftop"
            stepNo={1}
            description="ค่าสำรวจ"
            docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-0` : null}
            confirmed={!!lead.payment_confirmed}
            onConfirmed={() => {
              // Advance subStep sync so user sees ID form immediately. /book
              // fires in background (fire-and-forget) and the final refresh
              // happens when user submits subStep 4 — avoids mid-flow flicker.
              setSubStep(4);
              if (!lead.pre_doc_no && selectedPkg) {
                apiFetch(`/api/leads/${lead.id}/book`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ package_id: parseInt(selectedPkg), total_price: DEPOSIT_AMOUNT }),
                }).catch(e => console.error("auto pre_doc_no failed:", e));
              }
            }}
            onVerified={(url) => { setSlipVerifiedUrl(url || null); setPaymentVerified(true); }}
          />
        </div>
      )}

      {/* Step 5: ยืนยัน */}
      {subStep === 4 && (
        <div className="space-y-2">
          {/* OCR scan helper */}
          <CustomerInfoForm
            values={{}}
            onChange={(patch) => {
              // Skip full_name — customer name is set earlier; don't overwrite from OCR here
              if (patch.id_card_number) setRegIdCard(patch.id_card_number);
              if (patch.id_card_address) setRegAddress(patch.id_card_address);
              if (patch.installation_address) setRegHouseNumber(patch.installation_address);
            }}
            fields={[]}
            showScan
          />
          <div className="rounded-lg border border-active/15 bg-white/60 p-3 space-y-2.5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลจดทะเบียน</div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
              <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน <span className="text-red-500">*</span></label>
              <input type="text" inputMode="numeric" maxLength={13} value={regIdCard} onChange={e => setRegIdCard(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก" className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน <span className="text-red-500">*</span></label>
              <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">โครงการ</label>
              <input type="text" value={regProject} onChange={e => setRegProject(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ติดตั้ง <span className="text-red-500">*</span></label>
              <textarea value={regHouseNumber} onChange={e => setRegHouseNumber(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
          </div>
        </div>
      )}

      {/* Confirm action — step 5 */}
      {subStep === 4 && (
        <div className="space-y-2">
          <button
            onClick={async () => {
              const missing: string[] = [];
              if (!regName) missing.push("ชื่อ-นามสกุล");
              if (!regIdCard || regIdCard.length !== 13) missing.push("เลขบัตรประชาชน (13 หลัก)");
              if (!regAddress) missing.push("ที่อยู่ตามบัตร");
              if (!regHouseNumber) missing.push("ที่อยู่ติดตั้ง");
              if (!paymentVerified) missing.push("กรุณาอัปโหลดสลิปชำระเงิน");
              if (!surveyDate) missing.push("วันนัดสำรวจ");
              if (!surveyTimeSlot) missing.push("ช่วงเวลา");
              if (missing.length > 0) {
                setNextError(missing.join(", "));
                return;
              }
              setNextError(null);
              setConfirmSaving(true);
              try {
                await apiFetch(`/api/leads/${lead.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    full_name: regName || undefined,
                    id_card_number: regIdCard || undefined,
                    id_card_address: regAddress || undefined,
                    installation_address: regHouseNumber || undefined,
                    payment_type: paymentMethod,
                    status: "survey",
                    survey_date: surveyDate,
                    survey_time_slot: surveyTimeSlot,
                    next_follow_up: null,
                  }),
                });
                // Wait for lead to refetch before releasing the spinner so the
                // button stays in "loading" state all the way until the card
                // actually transitions to done — no flicker of re-enabled button.
                await refresh();
              } finally { setConfirmSaving(false); }
            }}
            disabled={confirmSaving}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirmSaving ? "กำลังบันทึก…" : "ยืนยันและเปิดขั้นสำรวจ"}
          </button>
        </div>
      )}

      {/* Navigation buttons */}
      {subStep < 4 && (() => {
        const stepGate: Record<number, string[]> = {
          0: ["full_name", "phone", "installation_address", "pre_residence_type", "pre_monthly_bill", "pre_peak_usage", "pre_electrical_phase"],
          1: ["pre_wants_battery", "interested_package_ids"],
          2: ["survey_date", "survey_time_slot"],
          3: [],
        };
        const handleNext = () => {
          const v = validatePreSurvey({ ...lead, ...formDraft, survey_date: surveyDate || lead.survey_date, survey_time_slot: surveyTimeSlot || lead.survey_time_slot });
          const missingHere = v.missing.filter(m => stepGate[subStep]?.includes(m.field));
          // Step 3 (ชำระเงิน): ต้องอัปโหลดสลิปก่อน
          if (subStep === 3 && !paymentVerified) {
            missingHere.push({ field: "slip", label: "กรุณาอัปโหลดสลิปชำระเงิน" });
          }
          if (missingHere.length > 0) {
            setNextError(missingHere.map(m => m.label).join(", "));
            return;
          }
          setNextError(null);
          setSubStep(subStep + 1);
          setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        };
        return (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              {subStep > 0 && (
                <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  ย้อนกลับ
                </button>
              )}
              <button type="button" onClick={handleNext} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
                ถัดไป
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        );
      })()}
      {subStep === 4 && subStep > 0 && (
        <button type="button" onClick={() => { setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="w-full h-9 mt-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ย้อนกลับ
        </button>
      )}

      {/* Image lightbox (bill photo / slip preview) */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/70" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl safe-top">✕</button>
          <img src={lightboxUrl} alt="Preview" className="max-w-[90vw] max-h-[78vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </StepLayout>
  );
}
