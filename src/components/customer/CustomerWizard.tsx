"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import CustomerInfoForm from "@/components/customer/CustomerInfoForm";
import ErrorPopup from "@/components/ui/ErrorPopup";
import LineIcon from "@/components/icons/LineIcon";

export interface CustomerWizardValues {
  full_name?: string;
  phone?: string;
  project_id?: string | number | null;
  project_name?: string;
  installation_address?: string;
  customer_type?: string;
  interested_package_id?: string;
  note?: string;
  source?: string;
  payment_type?: string;
  requirement?: string;
  id_card_number?: string;
  id_card_address?: string;
  id_card_photo_url?: string | null;
  house_reg_photo_url?: string | null;
  utility_provider?: string;
  ca_number?: string;
  meter_number?: string;
  monthly_bill?: string;
  house_number?: string;
  // Sheet-sync extras
  customer_code?: string;
  seeker_type?: string;
  seeker_name?: string;
  customer_interest?: string;
  home_loan_status?: string;
  project_note?: string;
  // Pre-survey interest fields surfaced on new-lead form
  pre_primary_reason?: string;
  pre_peak_usage?: string;
  pre_electrical_phase?: string;
  pre_wants_battery?: string;
  pre_roof_shape?: string;
  pre_residence_type?: string;
  pre_appliances?: string;
}

interface Project { id: number; name: string; district: string | null; province: string | null; }
interface Package {
  id: number; name: string; kwp: number; phase: number; has_battery: boolean;
  battery_kwh: number; battery_brand: string; solar_panels: number; panel_watt: number;
  inverter_kw: number; inverter_brand: string; price: number; is_upgrade: boolean;
  has_panel: boolean; has_inverter: boolean;
}

export interface LineProfileInfo {
  display_name: string;
  picture_url: string | null;
}

interface Props {
  values: CustomerWizardValues;
  onChange: (patch: Partial<CustomerWizardValues>) => void;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  saving?: boolean;
  lineProfile?: LineProfileInfo | null;
  /** true = will be linked on save, not yet saved */
  linePending?: boolean;
  onLinkLine?: () => void;
  /** "create" hides sheet-sync extras to keep new-lead step minimal; "edit" shows them. */
  mode?: "create" | "edit";
}

const SOURCES = [
  { value: "walk-in", label: "SENX PM" },
  { value: "event", label: "Event" },
  { value: "ads", label: "Ads" },
  { value: "the1", label: "The1" },
  { value: "web", label: "Web" },
  { value: "refer", label: "Refer" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
];
const CUSTOMER_TYPES = [
  { value: "ลูกค้าใหม่ยังไม่มีโซล่า", label: "New" },
  { value: "ลูกค้าเดิมต้องการ Upgrade/Battery", label: "Upgrade" },
];
const PAYMENT_TYPES = [
  { value: "cash", label: "เงินสด" },
  { value: "home_equity", label: "สินเชื่อบ้าน" },
  { value: "finance", label: "ไฟแนนซ์" },
];
const BATTERY_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
  { value: "upgrade", label: "+ Upgrade" },
];
const UTILITY_PROVIDERS = [
  { value: "MEA", label: "MEA (นครหลวง)" },
  { value: "PEA", label: "PEA (ภูมิภาค)" },
];

const SUB_STEPS = ["ลูกค้า", "แพ็คเกจ", "จดทะเบียน", "ไฟฟ้า"];

const chipBtn = (selected: boolean) =>
  `h-9 px-3 rounded-lg text-[15px] font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const fieldCard = "rounded-lg bg-white border border-gray-200 p-3";
const fieldLabel = "text-sm font-semibold tracking-wider uppercase text-gray-400 block mb-1.5";
const fieldInput = "w-full h-11 px-3 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors";
const fieldTextarea = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors resize-none";

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);


// Option lists used by the comprehensive create form.
const PRIMARY_REASONS = [
  { value: "save_bill", label: "ประหยัดค่าไฟ" },
  { value: "sell_back", label: "ขายไฟคืน" },
  { value: "tax_deduction", label: "ลดหย่อนภาษี" },
  { value: "daytime_usage", label: "เปิดแอร์ทั้งวัน" },
  { value: "has_ev", label: "ชาร์จ EV" },
  { value: "environment", label: "รักษ์โลก" },
  { value: "home_business", label: "เปิดร้านที่บ้าน" },
];
const PEAK_USAGE_OPTIONS = [
  { value: "day", label: "กลางวัน" },
  { value: "night", label: "กลางคืน" },
  { value: "both", label: "ทั้งสองช่วง" },
];
const ELECTRICAL_PHASE_OPTIONS = [
  { value: "1_phase", label: "1 เฟส" },
  { value: "3_phase", label: "3 เฟส" },
];
const BATTERY_WANT_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
];
const ROOF_SHAPE_OPTIONS = [
  { value: "gable", label: "หน้าจั่ว" },
  { value: "hip", label: "ปั้นหยา" },
  { value: "shed", label: "เพิงหมาแหงน" },
  { value: "flat", label: "ทรงแบน" },
];
const RESIDENCE_TYPE_OPTIONS = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
];
const APPLIANCE_OPTIONS = [
  { value: "water_heater", label: "เครื่องทำน้ำอุ่น" },
  { value: "ev", label: "ที่ชาร์จ EV" },
];

// Module-level so React keeps the same component identity across renders —
// declaring these inside CreateProfileForm caused inputs to remount on every
// keystroke (focus/value lost). Don't move these back inside.
function FormCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${fieldCard} ${className ?? ""}`}>
      <div className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormField({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// Comprehensive create form: all 35 fields in card-style sections matching the
// rest of the app (rounded-lg bg-white border + uppercase labels + h-11 inputs).
function CreateProfileForm({
  values,
  onChange,
  projects,
  lineProfile,
  linePending,
  onLinkLine,
}: {
  values: CustomerWizardValues;
  onChange: (patch: Partial<CustomerWizardValues>) => void;
  projects: Project[];
  lineProfile?: LineProfileInfo | null;
  linePending?: boolean;
  onLinkLine?: () => void;
}) {
  const [projectText, setProjectText] = useState<string>(values.project_name || "");
  const [projectFocused, setProjectFocused] = useState(false);
  useEffect(() => {
    if (values.project_name && values.project_name !== projectText) setProjectText(values.project_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.project_name]);
  const projectSuggestions = projectFocused && projectText.length >= 1
    ? projects.filter(p => p.name.toLowerCase().includes(projectText.toLowerCase())).slice(0, 8)
    : [];

  const toggleAppliance = (v: string) => {
    const set = new Set((values.pre_appliances || "").split(",").filter(Boolean));
    if (set.has(v)) set.delete(v); else set.add(v);
    onChange({ pre_appliances: Array.from(set).join(",") || "" });
  };
  const hasAppliance = (v: string) => (values.pre_appliances || "").split(",").includes(v);

  return (
    <div className="lg:max-w-4xl mx-auto max-w-xl space-y-3">
      {/* Row 1: ติดต่อ + ที่อยู่ติดตั้ง */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:items-start">
        <FormCard title="ติดต่อ">
          <FormField label="ชื่อ-นามสกุล" required>
            <input
              type="text"
              value={values.full_name ?? ""}
              onChange={e => onChange({ full_name: e.target.value })}
              placeholder="ชื่อลูกค้า"
              className={fieldInput}
            />
          </FormField>
          <FormField label="เบอร์โทร">
            <input
              type="tel"
              value={values.phone ?? ""}
              onChange={e => onChange({ phone: e.target.value })}
              placeholder="08x-xxx-xxxx"
              className={fieldInput + " font-mono tabular-nums"}
            />
          </FormField>
          {lineProfile !== undefined && (
            <FormField label="LINE">
              {lineProfile ? (
                <div className="flex items-center gap-2 h-11 px-3 rounded-lg border border-gray-200 bg-white">
                  {lineProfile.picture_url ? (
                    <img src={lineProfile.picture_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#06C755] flex items-center justify-center shrink-0 text-white"><LineIcon /></div>
                  )}
                  <span className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{lineProfile.display_name}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${linePending ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                    {linePending ? "รอเชื่อม" : "เชื่อมแล้ว"}
                  </span>
                </div>
              ) : onLinkLine ? (
                <button
                  type="button"
                  onClick={onLinkLine}
                  className="w-full h-11 px-3 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:border-active hover:text-active transition-colors"
                  style={{ minHeight: 0 }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  เชื่อม LINE user
                </button>
              ) : null}
            </FormField>
          )}
        </FormCard>

        <FormCard title="ที่อยู่ติดตั้ง">
          <div className="grid grid-cols-3 gap-2">
            <FormField label="บ้านเลขที่">
              <input
                type="text"
                value={values.house_number ?? ""}
                onChange={e => onChange({ house_number: e.target.value })}
                placeholder="123/45"
                className={fieldInput}
              />
            </FormField>
            <FormField label="โครงการ" className="col-span-2">
              <div className="relative">
                <input
                  type="text"
                  value={projectText}
                  onChange={e => { setProjectText(e.target.value); onChange({ project_id: null, project_name: e.target.value }); }}
                  onFocus={() => setProjectFocused(true)}
                  onBlur={() => setTimeout(() => setProjectFocused(false), 200)}
                  placeholder="พิมพ์ชื่อโครงการ..."
                  className={fieldInput}
                />
                {projectSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {projectSuggestions.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setProjectText(p.name); onChange({ project_id: p.id, project_name: p.name }); setProjectFocused(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-active-light transition-colors"
                      >
                        <div className="text-sm text-gray-800">{p.name}</div>
                        {(p.district || p.province) && <div className="text-xs text-gray-400">{[p.district, p.province].filter(Boolean).join(", ")}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </FormField>
          </div>
          <FormField label="ที่อยู่">
            <textarea
              value={values.installation_address ?? ""}
              onChange={e => onChange({ installation_address: e.target.value })}
              placeholder="ที่อยู่ติดตั้ง"
              rows={2}
              className={fieldTextarea}
            />
          </FormField>
        </FormCard>
      </div>

      {/* Row 2: ที่มา / ประเภท */}
      <FormCard title="ที่มา / ประเภทลูกค้า">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FormField label="ที่มา">
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map(s => (
                <button key={s.value} type="button" onClick={() => onChange({ source: s.value })} className={chipBtn(values.source === s.value)} style={{ minHeight: 0 }}>{s.label}</button>
              ))}
            </div>
          </FormField>
          <FormField label="ประเภทลูกค้า">
            <div className="grid grid-cols-2 gap-2">
              {CUSTOMER_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => onChange({ customer_type: t.value })} className={chipBtn(values.customer_type === t.value)} style={{ minHeight: 0 }}>{t.label}</button>
              ))}
            </div>
          </FormField>
        </div>
      </FormCard>
    </div>
  );
}

// `mode` prop is accepted for backwards compatibility (callers still pass it)
// but ignored — both create and edit render the same compact form now.
export default function CustomerWizard({ values, onChange, onSubmit, submitLabel = "บันทึก", saving, lineProfile, linePending, onLinkLine }: Props) {
  const [nextError, setNextError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    apiFetch("/api/projects").then(setProjects).catch(console.error);
  }, []);

  return (
    <div className="space-y-4">
      <CreateProfileForm
        values={values}
        onChange={onChange}
        projects={projects}
        lineProfile={lineProfile}
        linePending={linePending}
        onLinkLine={onLinkLine}
      />

      {/* Footer save button — single-button footer with top border separator,
          matching AddActivityModal's pattern. */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
        <button type="button" onClick={onSubmit} disabled={saving} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {saving ? "กำลังบันทึก…" : submitLabel}
        </button>
      </div>

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
  );
}
