"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/roles";
import { PAYMENT_TYPES, FINANCE_STATUSES, isPreSurvey } from "@/lib/constants/statuses";
import type { Lead, Package, StepCommonProps } from "./types";
import PreSurveyForm, { type PreSurveyFormHandle } from "./PreSurveyForm";
import PaymentSection from "@/components/payment/PaymentSection";
import PaymentSlipsThumbs from "@/components/payment/PaymentSlipsThumbs";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import { validatePreSurvey } from "@/lib/constants/step-validators";
import ErrorPopup from "@/components/ui/ErrorPopup";
import FallbackImage from "@/components/ui/FallbackImage";
import DocumentScanner from "@/components/customer/DocumentScanner";
import StepLayout from "../StepLayout";
import ReceiptButtons from "../ReceiptButtons";
import ReceiptModal from "../ReceiptModal";
import { buildAppointmentFlex } from "@/lib/utils/line-flex";
import { formatSlotsRange } from "@/lib/time-slots";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { formatTHB as formatPrice, formatThaiDate as formatDate } from "@/lib/utils/formatters";
import DoneSection from "./DoneSection";

const DEPOSIT_AMOUNT = 1000;

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

// Done-view label/value row. On mobile, label/value spread to opposite edges
// like a typical key-value row. On desktop, the label gets a fixed width so
// every value lines up on the same left edge across sections.
// `multiline=true` stacks label above value on mobile (both left-aligned at
// the section's left edge) — long-form text reads better that way than
// right-justified wraps.
const DataRow = ({ label, value, valueClass, multiline }: { label: string; value: React.ReactNode; valueClass?: string; multiline?: boolean }) => {
  if (multiline) {
    return (
      <div className="flex flex-col lg:flex-row lg:gap-2 text-sm">
        <span className="text-gray-400 shrink-0 lg:w-40">{label}</span>
        <span className={`font-semibold text-gray-800 min-w-0 text-left ${valueClass || ""}`}>{value}</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2 text-sm justify-between lg:justify-start">
      <span className="text-gray-400 shrink-0 lg:w-40">{label}</span>
      <span className={`font-semibold text-gray-800 min-w-0 text-right lg:text-left ${valueClass || ""}`}>{value}</span>
    </div>
  );
};

interface Props extends StepCommonProps {
  packages: Package[];
  lead: Lead;
  expanded?: boolean;
  onToggle?: () => void;
}

export default function PreSurveyStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const { me } = useMe();
  const [regName, setRegName] = useState(lead.full_name || "");
  const [regEmail, setRegEmail] = useState(lead.email || "");
  const [regIdCard, setRegIdCard] = useState(lead.id_card_number || "");
  const [regAddress, setRegAddress] = useState(lead.id_card_address || "");
  const [regHouseNumber, setRegHouseNumber] = useState(lead.installation_address || "");
  const REG_SUB_STEPS = ["ข้อมูล", "แพ็คเกจ", "ยืนยัน", "ชำระเงิน", "นัดสำรวจ"];
  const [subStep, setSubStep] = useSubStep(`preSurveySubStep_${lead.id}`, 0, REG_SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<Lead>>({});
  const isFirstRegSave = useRef(true);
  const regSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildRegPayload = () => ({
    full_name: regName ? regName.slice(0, 200) : undefined,
    email: regEmail ? regEmail.slice(0, 200) : null,
    id_card_number: regIdCard ? regIdCard.slice(0, 13) : undefined,
    id_card_address: regAddress ? regAddress.slice(0, 500) : undefined,
    installation_address: regHouseNumber ? regHouseNumber.slice(0, 500) : undefined,
  });
  useEffect(() => {
    if (isFirstRegSave.current) { isFirstRegSave.current = false; return; }
    if (regSaveTimerRef.current) clearTimeout(regSaveTimerRef.current);
    regSaveTimerRef.current = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRegPayload()),
      }).catch(console.error);
      regSaveTimerRef.current = null;
    }, 600);
    return () => {
      if (regSaveTimerRef.current) { clearTimeout(regSaveTimerRef.current); regSaveTimerRef.current = null; }
    };
  }, [regName, regEmail, regIdCard, regAddress, regHouseNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zone, setZone] = useState<string>(lead.zone ?? "");
  const [zones, setZones] = useState<{ id: number; name: string; color: string }[]>([]);
  useEffect(() => {
    apiFetch("/api/zones").then((zs: { id: number; name: string; color: string }[]) => {
      setZones(zs);
      // Default to "กรุงเทพ" for new leads — most surveys are in Bangkok, so
      // prefilling avoids an extra tap. Skipped if the lead already has a zone.
      const defaultZone = zs.find(z => z.name.startsWith("กรุงเทพ"));
      if (!lead.zone && defaultZone) {
        setZone(defaultZone.name);
        apiFetch(`/api/leads/${lead.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zone: defaultZone.name }),
        }).catch(console.error);
      }
    }).catch(console.error);
  }, [lead.id, lead.zone]);
  // Pre-survey form state
  const [selectedPkg, setSelectedPkg] = useState(lead.interested_package_id ? String(lead.interested_package_id) : "");
  const [paymentMethod, setPaymentMethod] = useState(lead.payment_type ?? "transfer");
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmSaved, setConfirmSaved] = useState(false);
  const [confirmingSaved, setConfirmingSaved] = useState(false);
  // Payment verification state — PaymentSection owns upload/verify and calls onVerified(url).
  // url may be "" when KBank authorized the payment but the slip file is unavailable.
  const [slipVerifiedUrl, setSlipVerifiedUrl] = useState<string | null>(lead.pre_slip_url ?? null);
  // paymentVerified = actual confirmation (not just slip upload). Derive from
  // lead.payment_confirmed in DB so a stray slip in staging can't unlock Next.
  const [paymentVerified, setPaymentVerified] = useState<boolean>(!!lead.payment_confirmed);
  const [surveyDate, setSurveyDate] = useState<string>(lead.survey_date ? lead.survey_date.slice(0, 10) : "");
  const [surveyTimeSlot, setSurveyTimeSlot] = useState<string>(lead.survey_time_slot ?? "");
  const [bookingPreviewOpen, setBookingPreviewOpen] = useState(false);
  const [notifyBookingLine, setNotifyBookingLine] = useState(true);
  // Tracks the last (date|slot) pair we PATCHed so picking the same combo
  // again doesn't fire a duplicate request. Initialised to the lead's
  // current values so opening the step doesn't trigger an unnecessary save.
  const lastBookingSavedRef = useRef<string>(`${lead.survey_date?.slice(0, 10) ?? ""}|${lead.survey_time_slot ?? ""}`);

  // Auto-save the slot the moment user picks date+slot — locks it for other
  // concurrent users via /api/surveys/scheduled. Status stays at 'pre_survey'
  // (status only flips to 'survey' on the explicit "ยืนยันและเปิดขั้นสำรวจ"
  // button), but a non-null survey_date is enough for the lock query.
  const lockSurveySlot = (nextDate: string, nextSlot: string) => {
    if (!nextDate || !nextSlot) return;
    const key = `${nextDate}|${nextSlot}`;
    if (key === lastBookingSavedRef.current) return;
    lastBookingSavedRef.current = key;
    apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_date: nextDate, survey_time_slot: nextSlot, zone: zone || undefined }),
    }).catch(console.error);
  };

  // Pre-Survey step is "done" once status advances past pre_survey altogether
  // (i.e. main status is survey/quote/...). Substeps pre_survey-01 / -02 are
  // STILL inside pre-survey — don't flip to done until main status changes.
  const hasPreSurveyDone = !isPreSurvey(lead.status);
  const hasReceipt = !!lead.pre_doc_no || !!lead.payment_confirmed;
  const paymentLabel = PAYMENT_TYPES.find(p => p.value === lead.payment_type)?.label;
  const financeConfig = FINANCE_STATUSES.find(f => f.value === lead.finance_status);

  // Auto-save pre-survey fields on change (debounced)
  const isFirstAutosave = useRef(true);
  const surveySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildSurveyDatePayload = () => ({
    survey_date: surveyDate || null,
    survey_time_slot: surveyTimeSlot || null,
  });
  useEffect(() => {
    if (isFirstAutosave.current) {
      isFirstAutosave.current = false;
      return;
    }
    if (surveySaveTimerRef.current) clearTimeout(surveySaveTimerRef.current);
    surveySaveTimerRef.current = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSurveyDatePayload()),
      }).catch(console.error);
      surveySaveTimerRef.current = null;
    }, 600);
    return () => {
      if (surveySaveTimerRef.current) { clearTimeout(surveySaveTimerRef.current); surveySaveTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyDate, surveyTimeSlot]);

  // Imperative flush — combines parent fields (reg + survey date) plus the
  // PreSurveyForm child's pending payload via formRef. Called by "ถัดไป" before
  // advancing so a fast click never drops the latest typed value.
  const formRef = useRef<PreSurveyFormHandle>(null);
  const flushAllSaves = async () => {
    if (regSaveTimerRef.current) { clearTimeout(regSaveTimerRef.current); regSaveTimerRef.current = null; }
    if (surveySaveTimerRef.current) { clearTimeout(surveySaveTimerRef.current); surveySaveTimerRef.current = null; }
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildRegPayload(), ...buildSurveyDatePayload() }),
      });
    } catch (e) { console.error(e); }
    if (formRef.current) await formRef.current.flushSave();
  };


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
    // Guard: never advance to "survey" without a verified payment.
    // Without this, a stray call (admin action, old flow, direct client
    // PATCH) can move status forward with payment_confirmed=false and no
    // slip — which is how lead #30 got to survey without paying.
    if (!paymentVerified) {
      setNextError("กรุณายืนยันชำระเงินก่อนเปิดขั้นสำรวจ");
      return;
    }
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
                {formatSlotsRange(lead.survey_time_slot)}
              </span>
            )}
          </span>
        )}
        {!lead.survey_date && <span className="flex-1" />}
        {hasReceipt && (
          <div className="mr-4 flex items-center gap-3">
            {/* ใบยืนยันการจอง — show whenever a booking number exists. */}
            {lead.pre_doc_no && (
              <ReceiptButtons
                leadId={lead.id}
                stage="deposit"
                fileLabel={`booking_${lead.pre_doc_no || lead.id}`}
                title="BOOKING CONFIRMATION"
                showSurvey
                label="ใบยืนยันการจอง"
                modalLabel="ใบยืนยันการจอง"
                compact
              />
            )}
            {/* ใบเสร็จ — only after accountant confirms (payment_confirmed=true,
                i.e. status reached pre_survey-02). */}
            {lead.payment_confirmed && (
              <ReceiptButtons leadId={lead.id} stage="deposit" fileLabel={lead.pre_doc_no || `lead_${lead.id}_deposit`} compact />
            )}
          </div>
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
              <DoneSection color="primary" title="แพ็คเกจที่สนใจ">
                <div className="space-y-0.5">
                  {selectedPkgs.map((p, idx) => (
                    <DataRow
                      key={p.id}
                      label={idx === 0 ? "แพ็คเกจ" : ""}
                      value={
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span>{p.name}</span>
                          {p.is_upgrade && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase shrink-0">UPGRADE</span>}
                          <span className="inline-flex items-center gap-0.5">
                            <svg className={`w-3 h-3 ${p.has_panel ? "text-amber-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                            <svg className={`w-3 h-3 ${p.has_inverter ? "text-violet-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                            <svg className={`w-3 h-3 ${p.has_battery ? "text-green-500 fill-green-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0021 15.75v-6a2.25 2.25 0 00-2.25-2.25h-15A2.25 2.25 0 001.5 9.75v6A2.25 2.25 0 003.75 18z" /></svg>
                          </span>
                          <span className="font-mono ml-auto pl-2">{formatPrice(p.price)} บาท</span>
                        </span>
                      }
                    />
                  ))}
                  {batteryLabel && <DataRow label="แบตเตอรี่" value={batteryLabel} />}
                </div>
              </DoneSection>
            ) : null;
          })()}

          {/* ข้อมูลลูกค้า · ที่อยู่ติดตั้ง */}
          {(lead.customer_type || lead.installation_address || lead.project_name) && (
            <DoneSection color="indigo" title="ข้อมูลลูกค้า">
              <div className="space-y-0.5">
                {lead.customer_type && <DataRow label="ประเภทลูกค้า" value={lead.customer_type} />}
                {lead.project_name && <DataRow label="โครงการ" value={lead.project_name} />}
                {lead.installation_address && <DataRow label="บ้านเลขที่" value={lead.installation_address} />}
              </div>
            </DoneSection>
          )}

          {/* บ้าน + หลังคา */}
          {(residenceLabel || roofLabel) && (
            <DoneSection color="amber" title="บ้าน">
              <div className="space-y-0.5">
                {residenceLabel && <DataRow label="ประเภทบ้าน" value={residenceLabel} />}
                {roofLabel && <DataRow label="รูปทรงหลังคา" value={roofLabel} />}
              </div>
            </DoneSection>
          )}

          {/* การใช้ไฟฟ้า */}
          {(phaseLabel || peakLabel || lead.pre_monthly_bill != null) && (
            <DoneSection color="blue" title="การใช้ไฟฟ้า">
              <div className="space-y-0.5">
                {lead.pre_monthly_bill != null && <DataRow label="ค่าไฟต่อเดือน" value={`${formatPrice(lead.pre_monthly_bill)} บาท`} valueClass="font-mono" />}
                {phaseLabel && <DataRow label="ระบบไฟ" value={phaseLabel} />}
                {peakLabel && <DataRow label="ช่วงใช้ไฟสูงสุด" value={peakLabel} />}
              </div>
            </DoneSection>
          )}

          {/* เครื่องใช้ไฟฟ้า */}
          {(acTotal > 0 || applianceList.length > 0) && (
            <DoneSection color="violet" title="เครื่องใช้ไฟฟ้า">
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
            </DoneSection>
          )}

          {/* การชำระเงิน · เอกสาร — always rendered in the done view so
              survey team can verify payment happened. Shows "—" for any
              missing field rather than hiding the whole section. */}
          <DoneSection color="emerald" title="ค่าสำรวจ · เอกสาร">
            <div className="space-y-0.5">
              <DataRow
                label="จำนวนเงิน"
                value={lead.pre_total_price != null ? `${formatPrice(lead.pre_total_price)} บาท` : "—"}
                valueClass="font-mono tabular-nums"
              />
              <DataRow label="วิธีชำระ" value={paymentLabel || "—"} valueClass="text-emerald-600" />
              {lead.pre_booked_at && (
                <DataRow
                  label="วันที่ชำระ"
                  value={new Date(String(lead.pre_booked_at).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                />
              )}
              <DataRow
                label="สถานะ"
                value={lead.payment_confirmed ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}
                valueClass={lead.payment_confirmed ? "text-emerald-600" : "text-amber-600"}
              />
            </div>
            {(lead.pre_bill_photo_url || lead.pre_slip_url) && (
              <div className="flex gap-3 mt-2">
                {lead.pre_bill_photo_url && (
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">บิลค่าไฟ</div>
                    <FallbackImage src={lead.pre_bill_photo_url} alt="Bill" lightboxLabel="บิลค่าไฟ" className="max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" fallbackLabel="บิลหาย" />
                  </div>
                )}
                {lead.pre_slip_url && (
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">สลิปชำระเงิน</div>
                    <PaymentSlipsThumbs slipUrl={lead.pre_slip_url} label="สลิปชำระเงิน" />
                  </div>
                )}
              </div>
            )}
            {!lead.pre_slip_url && (
              <div className="mt-2 text-xs text-amber-600">⚠ ไม่มีไฟล์สลิปในระบบ</div>
            )}
          </DoneSection>

          {/* ข้อมูลลูกค้าเพื่อออกใบเสร็จ · เอกสาร */}
          {(lead.id_card_number || lead.id_card_address || lead.id_card_photo_url || lead.house_reg_photo_url || lead.email) && (
            <DoneSection color="teal" title="ข้อมูลลูกค้าเพื่อออกใบเสร็จ">
              <div className="space-y-0.5">
                {lead.email && <DataRow label="อีเมล" value={lead.email} valueClass="break-all" />}
                {lead.id_card_number && <DataRow label="เลขบัตรประชาชน" value={lead.id_card_number} valueClass="font-mono tabular-nums" />}
                {lead.id_card_address && <DataRow label="ที่อยู่ตามบัตร" value={lead.id_card_address} valueClass="break-words" />}
              </div>
              {(lead.id_card_photo_url || lead.house_reg_photo_url) && (
                <div className="flex gap-3 mt-1.5">
                  {lead.id_card_photo_url && (
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">บัตรประชาชน</div>
                      <FallbackImage src={lead.id_card_photo_url} alt="ID card" lightboxLabel="บัตรประชาชน" className="max-h-32 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" fallbackLabel="ไม่มีไฟล์" />
                    </div>
                  )}
                  {lead.house_reg_photo_url && (
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">ทะเบียนบ้าน</div>
                      <FallbackImage src={lead.house_reg_photo_url} alt="House reg" lightboxLabel="ทะเบียนบ้าน" className="max-h-32 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" fallbackLabel="ไม่มีไฟล์" />
                    </div>
                  )}
                </div>
              )}
            </DoneSection>
          )}

          {/* บันทึก · ข้อความจากฝ่ายขาย */}
          {(lead.requirement || lead.note) && (
            <DoneSection color="gray" title="บันทึก">
              <div className="space-y-0.5">
                {lead.requirement && <DataRow label="ความต้องการ" value={lead.requirement} valueClass="whitespace-pre-wrap break-words" multiline />}
                {lead.note && <DataRow label="หมายเหตุ" value={lead.note} valueClass="whitespace-pre-wrap break-words font-normal text-gray-500" multiline />}
              </div>
            </DoneSection>
          )}

          {/* Action — only the receipt buttons once pre-survey is done.
              Editable registration form no longer belongs here: the status
              has already moved forward, so exposing inputs + "ยืนยันและเปิด
              ขั้นสำรวจ" again is misleading. ID/project info is read-only
              in the "ข้อมูลลูกค้าเพื่อออกใบเสร็จ" section above. */}
          {hasReceipt && (
            <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
              <ReceiptButtons
                leadId={lead.id}
                stage="deposit"
                fileLabel={`booking_${lead.pre_doc_no || lead.id}`}
                title="BOOKING CONFIRMATION"
                showSurvey
                label="ใบยืนยันการจอง"
                modalLabel="ใบยืนยันการจอง"
              />
              <ReceiptButtons leadId={lead.id} stage="deposit" fileLabel={lead.pre_doc_no || `lead_${lead.id}_deposit`} />
            </div>
          )}
        </>);

    return (<>
      <StepLayout
        state="done"
        doneHeader={doneHeaderContent}
        renderDone={renderDoneContent}
        expanded={expanded}
        onToggle={onToggle}
      />
      </>
    );
  }

  // Sub-step navigation is unrestricted — users can move freely between sub-steps.
  // All required-field validation is enforced at the final "ยืนยัน" button (sub-step 4).
  // Always flushAllSaves before changing tab so any in-flight typed value lands.
  const handleSubStepChange = async (i: number) => {
    setNextError(null);
    await flushAllSaves();
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
        <PreSurveyForm ref={formRef} lead={lead} refresh={refresh} packages={packages} hidePackages={subStep !== 1} onlyPackages={subStep === 1} onPackageChange={setSelectedPkg} onFormChange={setFormDraft} />
      </div>

      {/* Step 2: ยืนยันข้อมูลใบเสร็จ — ย้ายจาก step สุดท้ายมาก่อนชำระเงิน
       * เพราะต้องมีข้อมูลออกใบเสร็จครบก่อนรับเงิน */}
      {subStep === 2 && (
        <div className="space-y-2">
          <DocumentScanner
            fields={["id_card_number", "id_card_address", "installation_address"]}
            onResult={(patch) => {
              if (patch.id_card_number) setRegIdCard(patch.id_card_number);
              if (patch.id_card_address) setRegAddress(patch.id_card_address);
              if (patch.installation_address) setRegHouseNumber(patch.installation_address);
            }}
          />
          <div className="rounded-lg border border-active/15 bg-white/60 p-3 space-y-2.5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลลูกค้าเพื่อออกใบเสร็จ</div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
              <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">อีเมล <span className="text-red-500">*</span></label>
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="example@mail.com" className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">เลขบัตรประชาชน <span className="text-red-500">*</span></label>
              <input type="text" value={regIdCard} onChange={e => setRegIdCard(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ที่อยู่ตามบัตรประชาชน <span className="text-red-500">*</span></label>
              <textarea value={regAddress} onChange={e => setRegAddress(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">ที่อยู่ติดตั้ง <span className="text-red-500">*</span></label>
                <label className="text-xs text-gray-600 inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary cursor-pointer"
                    checked={!!regAddress && regHouseNumber === regAddress}
                    onChange={(e) => {
                      // Mirror the ID-card address into ที่อยู่ติดตั้ง when ticked
                      // — most leads install at the registered address. Untick to
                      // edit independently again.
                      if (e.target.checked) setRegHouseNumber(regAddress);
                    }}
                  />
                  เหมือนที่อยู่ตามบัตร
                </label>
              </div>
              <textarea value={regHouseNumber} onChange={e => setRegHouseNumber(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
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
            onConfirmed={async () => {
              // User clicked the real "ยืนยันรับชำระเงิน" button — this is
              // the only moment we flip paymentVerified so Next can unlock.
              // Stay on this sub-step; user clicks "ถัดไป" when they're ready.
              setPaymentVerified(true);
              if (!lead.pre_doc_no && selectedPkg) {
                try {
                  await apiFetch(`/api/leads/${lead.id}/book`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ package_id: parseInt(selectedPkg), total_price: DEPOSIT_AMOUNT }),
                  });
                } catch (e) { console.error("auto pre_doc_no failed:", e); }
              }
              // Always mirror the deposit amount + timestamp onto the lead row
              // so the done-view payment summary can read them without
              // re-querying the payments table. Without this, leads that
              // skipped the /book path (e.g. seeker syncs that didn't pick a
              // package) end up with pre_total_price/booked_at = null even
              // after payment is confirmed.
              if (lead.pre_total_price == null) {
                try {
                  await apiFetch(`/api/leads/${lead.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      pre_total_price: DEPOSIT_AMOUNT,
                      pre_booked_at: new Date().toISOString(),
                    }),
                  });
                } catch (e) { console.error("mirror payment meta failed:", e); }
              }
              // Stamp the user who confirmed payment so the receipt PDF can render their signature.
              if (me?.id) {
                apiFetch(`/api/leads/${lead.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ payment_confirmed_by: me.id }),
                }).catch(console.error);
              }
              await refresh();
            }}
            // onVerified fires on slip upload (staging) — not a real confirmation.
            // Track the URL so the lead eventually stores pre_slip_url, but do
            // NOT set paymentVerified here.
            onVerified={(url) => { setSlipVerifiedUrl(url || null); }}
            onUndone={refresh}
          />
        </div>
      )}

      {/* Step 5: นัดสำรวจ — ย้ายจาก step 3 มาเป็น step สุดท้าย ติดกับปุ่ม
       * "ยืนยันและเปิดขั้นสำรวจ" */}
      {subStep === 4 && (
        <div className="space-y-2">
          <div className="rounded-lg border border-active/15 bg-white/60 p-4">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">Zone</label>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {zones.map(z => {
                const active = zone === z.name;
                // Selected: filled with the zone's color. Unselected: white pill
                // with a small dot in the zone color so the user can see the
                // legend without selecting first.
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => {
                      setZone(z.name);
                      apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: z.name }) }).catch(console.error);
                    }}
                    className="w-full h-10 rounded-lg text-sm font-semibold border transition-all text-left px-4 inline-flex items-center gap-2"
                    style={{
                      backgroundColor: active && z.color ? z.color : "white",
                      borderColor: z.color || "#e5e7eb",
                      color: active ? "white" : (z.color || "#4b5563"),
                    }}
                  >
                    {!active && z.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                    )}
                    {z.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-lg border border-active/15 bg-white/60 p-4">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">
              Survey Appointment <span className="text-red-500">*</span>
            </label>
            <CalendarPicker
              date={surveyDate}
              timeSlot={surveyTimeSlot}
              onDateChange={(d) => { setSurveyDate(d); lockSurveySlot(d, surveyTimeSlot); }}
              onTimeSlotChange={(s) => { setSurveyTimeSlot(s); lockSurveySlot(surveyDate, s); }}
              showSurveySlots
              required
              teamContext="survey"
              excludeLeadId={lead.id}
              allowPast
            />
            <div className="text-xs text-gray-500 mt-2">นัดครั้งแรก · เลื่อนนัดทำได้ในขั้น Survey</div>
          </div>

          {/* Booking Confirmation preview + optional LINE notify — same shape
              as the survey-result row in SurveyStep. Disabled until both date
              and slot are picked, since the doc embeds them. */}
          <div className="flex md:grid md:grid-cols-3 items-center gap-3">
            <button
              type="button"
              disabled={!surveyDate || !surveyTimeSlot}
              onClick={() => setBookingPreviewOpen(true)}
              className="shrink-0 md:col-span-1 md:w-auto h-10 px-4 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ดูใบยืนยันนัดสำรวจ
            </button>
            {lead.line_id && (
              <label className="flex-1 md:col-span-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyBookingLine}
                  onChange={(e) => setNotifyBookingLine(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span>ส่งใบยืนยันนัดให้ลูกค้าทาง LINE</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Confirm action — step 5. Mobile: full-width 50/50 with Back below.
          Desktop: Back left / ยืนยัน right (same pattern as other sub-steps). */}
      {subStep === 4 && (
        <div className="mt-3 flex gap-2 md:justify-between">
          <button type="button" onClick={() => { setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            ย้อนกลับ
          </button>
          <button
            onClick={async () => {
              const missing: string[] = [];
              // Sub-step 0/1 form fields — pulled from validatePreSurvey to keep the
              // required-field list in one place (ประเภทบ้าน, ค่าไฟ, ช่วงไฟสูงสุด, เฟส, แบต, แพ็คเกจ).
              const v = validatePreSurvey({
                ...lead,
                ...formDraft,
                full_name: regName || lead.full_name,
                installation_address: regHouseNumber || lead.installation_address,
                survey_date: surveyDate || lead.survey_date,
                survey_time_slot: surveyTimeSlot || lead.survey_time_slot,
              });
              for (const m of v.missing) missing.push(m.label);
              // ยืนยัน-only fields (id card / payment slip)
              if (!regEmail) missing.push("อีเมล");
              if (!regIdCard) missing.push("เลขบัตรประชาชน");
              if (!regAddress) missing.push("ที่อยู่ตามบัตร");
              if (!paymentVerified) missing.push((slipVerifiedUrl ? "กรุณายืนยันชำระเงิน" : "กรุณาอัปโหลดสลิปชำระเงิน"));
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
                    email: regEmail || null,
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
                // Send the Booking Confirmation flex to the customer's LINE if
                // they're linked and the user opted in. Mirrors the survey-done
                // notify in SurveyStep.markDone — fire-and-forget so the spinner
                // doesn't wait on LINE delivery.
                if (notifyBookingLine && lead.line_id) {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  const pdfUrl = `${origin}/api/receipt?lead_id=${lead.id}&stage=deposit&format=pdf&show_survey=1&title=${encodeURIComponent("BOOKING CONFIRMATION")}`;
                  const msg = buildAppointmentFlex({
                    origin,
                    kind: "survey",
                    name: regName || lead.full_name,
                    date: surveyDate,
                    timeSlot: surveyTimeSlot,
                    address: regHouseNumber || lead.installation_address,
                    project: lead.project_name,
                    documents: ["บิลค่าไฟฟ้าล่าสุด"],
                    actionLabel: "ดาวน์โหลดใบยืนยันนัด",
                    actionUrl: pdfUrl,
                  });
                  apiFetch("/api/line/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
                  }).catch(console.error);
                }
                // Wait for lead to refetch before releasing the spinner so the
                // button stays in "loading" state all the way until the card
                // actually transitions to done — no flicker of re-enabled button.
                await refresh();
              } finally { setConfirmSaving(false); }
            }}
            disabled={confirmSaving}
            className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {confirmSaving ? "กำลังบันทึก…" : "ยืนยันและเปิดขั้นสำรวจ"}
          </button>
        </div>
      )}

      {/* Navigation buttons — "ถัดไป" verifies the current sub-step's required fields. */}
      {subStep < 4 && (() => {
        const stepGate: Record<number, string[]> = {
          0: ["full_name", "phone", "pre_residence_type", "pre_monthly_bill", "pre_peak_usage", "pre_electrical_phase"],
          1: ["pre_wants_battery", "interested_package_ids"],
          // Step 2 (ยืนยันข้อมูลใบเสร็จ): id card + customer info validated
          // ad-hoc below since fields aren't in validatePreSurvey
          2: [],
          // Step 3 (ชำระเงิน): no validatePreSurvey gate — paymentVerified is
          // checked separately below
          3: [],
        };
        const handleNext = async () => {
          const v = validatePreSurvey({ ...lead, ...formDraft, survey_date: surveyDate || lead.survey_date, survey_time_slot: surveyTimeSlot || lead.survey_time_slot });
          const missingHere = v.missing.filter(m => stepGate[subStep]?.includes(m.field));
          if (subStep === 2) {
            if (!regName) missingHere.push({ field: "full_name", label: "ชื่อ-นามสกุล" });
            if (!regEmail) missingHere.push({ field: "email", label: "อีเมล" });
            if (!regIdCard) missingHere.push({ field: "id_card", label: "เลขบัตรประชาชน" });
            if (!regAddress) missingHere.push({ field: "id_card_address", label: "ที่อยู่ตามบัตร" });
            if (!regHouseNumber) missingHere.push({ field: "installation_address", label: "ที่อยู่ติดตั้ง" });
          }
          if (subStep === 3 && !paymentVerified) {
            missingHere.push({ field: "slip", label: (slipVerifiedUrl ? "กรุณายืนยันชำระเงิน" : "กรุณาอัปโหลดสลิปชำระเงิน") });
          }
          if (missingHere.length > 0) {
            setNextError(missingHere.map(m => m.label).join(", "));
            return;
          }
          await flushAllSaves();
          setNextError(null);
          setSubStep(subStep + 1);
          setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        };
        return (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2 md:justify-between">
              {subStep > 0 ? (
                <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  ย้อนกลับ
                </button>
              ) : <span className="hidden md:block md:w-64" />}
              <button type="button" onClick={handleNext} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
                ถัดไป
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        );
      })()}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      {bookingPreviewOpen && (
        <ReceiptModal
          leadId={lead.id}
          stage="deposit"
          fileLabel={`booking_${lead.id}`}
          title="BOOKING CONFIRMATION"
          showSurvey
          modalLabel="ใบยืนยันนัดสำรวจ"
          onClose={() => setBookingPreviewOpen(false)}
        />
      )}
    </StepLayout>
  );
}
