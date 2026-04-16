"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import CustomerInfoForm from "@/components/CustomerInfoForm";
import ErrorPopup from "@/components/ErrorPopup";
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
}

const SOURCES = [
  { value: "walk-in", label: "Walk-in" },
  { value: "event", label: "Event" },
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


export default function CustomerWizard({ values, onChange, onSubmit, submitLabel = "บันทึก", saving, lineProfile, linePending, onLinkLine }: Props) {
  const [subStep, setSubStep] = useState(0);
  const [nextError, setNextError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [wantsBattery, setWantsBattery] = useState<string>("maybe");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/projects"),
      apiFetch("/api/packages"),
    ]).then(([p, pk]) => { setProjects(p); setPackages(pk); }).catch(console.error);
  }, []);

  const filteredPackages = packages.filter(p => {
    if (wantsBattery === "upgrade") return p.is_upgrade;
    if (wantsBattery === "yes") return p.has_battery && !p.is_upgrade;
    if (wantsBattery === "no") return !p.has_battery && !p.is_upgrade;
    if (wantsBattery === "maybe") return !p.is_upgrade;
    return true;
  });

  const goTo = (i: number) => { setNextError(null); setSubStep(i); };

  return (
    <div className="flex flex-col space-y-3 lg:space-y-4 min-h-full">
      {/* Step indicator — sticky on desktop */}
      <div className="md:sticky md:top-0 md:z-10 md:bg-white md:pt-2 md:pb-3 md:-mt-2 flex items-center gap-1 mb-3 md:mb-0 lg:max-w-2xl">
        {SUB_STEPS.map((label, i) => (
          <button key={i} type="button" onClick={() => goTo(i)} className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
            <div className={`h-1 w-full rounded-full transition-colors ${i <= subStep ? "bg-active" : "bg-gray-200"}`} />
            <span className={`text-xs font-semibold transition-colors ${i === subStep ? "text-active" : i < subStep ? "text-gray-500" : "text-gray-300"}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Step 0: ลูกค้า */}
      {subStep === 0 && (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-3 lg:space-y-0">
          <div className="space-y-3">
            <CustomerInfoForm
              values={values}
              onChange={onChange}
              groups={["identity", "contact"]}
              required={["full_name"]}
              showScan
            />
            {/* LINE link status */}
            {(lineProfile !== undefined) && (
              lineProfile ? (
                <div className={fieldCard}>
                  <label className={fieldLabel}>LINE Profile</label>
                  <div className="flex items-center gap-3">
                  {lineProfile.picture_url ? (
                    <img src={lineProfile.picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#06C755] flex items-center justify-center shrink-0 text-white"><LineIcon /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900">{lineProfile.display_name}</div>
                    <div className={`text-xs font-semibold ${linePending ? "text-amber-500" : "text-[#06C755]"}`}>{linePending ? "รอเชื่อมเมื่อบันทึก" : "เชื่อม LINE แล้ว"}</div>
                  </div>
                  </div>
                </div>
              ) : onLinkLine ? (
                <div className={fieldCard}>
                  <label className={fieldLabel}>LINE Profile</label>
                  <button type="button" onClick={onLinkLine} className="flex items-center gap-3 w-full text-left hover:opacity-70 transition-opacity cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-gray-400"><LineIcon /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-500">ยังไม่ได้เชื่อม LINE</div>
                      <div className="text-xs text-gray-400">กดเพื่อเลือก LINE user</div>
                    </div>
                    <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  </button>
                </div>
              ) : null
            )}
          </div>
          <div className="space-y-3">
            <div className={fieldCard}>
              <label className={fieldLabel}>ที่มาของลูกค้า</label>
              <div className="grid grid-cols-3 gap-2">
                {SOURCES.map(s => (
                  <button key={s.value} type="button" onClick={() => onChange({ source: s.value })} className={chipBtn(values.source === s.value)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className={fieldCard}>
              <label className={fieldLabel}>ประเภทลูกค้า</label>
              <div className="grid grid-cols-3 gap-2">
                {CUSTOMER_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => onChange({ customer_type: t.value })} className={chipBtn(values.customer_type === t.value)}>{t.label}</button>
                ))}
              </div>
            </div>
            <CustomerInfoForm
              values={values}
              onChange={onChange}
              groups={["project", "installation"]}
              projects={projects}
            />
          </div>
        </div>
      )}

      {/* Step 1: แพ็คเกจ */}
      {subStep === 1 && (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-3 lg:space-y-0">
          <div className="space-y-3">
            <div className={fieldCard}>
              <label className={fieldLabel}>แบตเตอรี่ + Upgrade</label>
              <div className="grid grid-cols-3 gap-2">
                {BATTERY_OPTIONS.map(b => (
                  <button key={b.value} type="button" onClick={() => { setWantsBattery(b.value); onChange({ interested_package_id: "" }); }} className={chipBtn(wantsBattery === b.value)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={fieldCard}>
              <label className={fieldLabel}>แพ็คเกจที่สนใจ</label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                {filteredPackages.length === 0 && (
                  <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">ไม่มีแพ็คเกจที่ตรงกับที่เลือก</div>
                )}
                {filteredPackages.map(p => {
                  const selected = values.interested_package_id === String(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => onChange({ interested_package_id: selected ? "" : String(p.id) })} className={`text-left rounded-xl p-3 border-2 transition-all ${selected ? "border-active bg-active-light" : "border-gray-100 bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate flex items-center gap-1.5">
                            {p.is_upgrade && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase shrink-0">UPGRADE</span>}
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                            {p.solar_panels > 0 && <span>{p.solar_panels} panels</span>}
                            {p.inverter_brand && <span>{p.inverter_brand} {p.inverter_kw}kW</span>}
                            {p.has_battery && <span>Battery {p.battery_kwh}kWh</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold font-mono tabular-nums">{formatPrice(p.price)}</div>
                          <div className="text-xs text-gray-400">THB</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className={fieldCard}>
              <label className={fieldLabel}>ความต้องการ</label>
              <textarea value={values.requirement ?? ""} onChange={e => onChange({ requirement: e.target.value })} placeholder="เช่น สนใจ 5kWp, มีแอร์ 3 เครื่อง, อยาก charge EV" rows={2} className={fieldTextarea} />
            </div>
            <div className={fieldCard}>
              <label className={fieldLabel}>หมายเหตุ</label>
              <textarea value={values.note ?? ""} onChange={e => onChange({ note: e.target.value })} placeholder="รายละเอียดเพิ่มเติม" rows={3} className={fieldTextarea} />
            </div>
            <div className={fieldCard}>
              <label className={fieldLabel}>วิธีชำระเงิน</label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_TYPES.map(p => (
                  <button key={p.value} type="button" onClick={() => onChange({ payment_type: p.value })} className={chipBtn(values.payment_type === p.value)}>{p.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: จดทะเบียน */}
      {subStep === 2 && (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-3 lg:space-y-0">
          <CustomerInfoForm
            values={values}
            onChange={onChange}
            groups={["id_card"]}
          />
          <CustomerInfoForm
            values={values}
            onChange={onChange}
            groups={["documents"]}
          />
        </div>
      )}

      {/* Step 3: Others */}
      {subStep === 3 && (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-3 lg:space-y-0">
          <div className="space-y-3">
            <div className={fieldCard}>
              <label className={fieldLabel}>การไฟฟ้า</label>
              <div className="grid grid-cols-3 gap-2">
                {UTILITY_PROVIDERS.map(u => (
                  <button key={u.value} type="button" onClick={() => onChange({ utility_provider: u.value })} className={chipBtn(values.utility_provider === u.value)}>{u.label}</button>
                ))}
              </div>
            </div>
            <div className={fieldCard}>
              <label className={fieldLabel}>เลขผู้ใช้ไฟ (CA)</label>
              <input type="text" value={values.ca_number ?? ""} onChange={e => onChange({ ca_number: e.target.value })} placeholder="เช่น 02-001-932-0090" className={fieldInput + " font-mono tabular-nums"} />
            </div>
          </div>
          <div className="space-y-3">
            <div className={fieldCard}>
              <label className={fieldLabel}>เลขมิเตอร์</label>
              <input type="text" value={values.meter_number ?? ""} onChange={e => onChange({ meter_number: e.target.value })} placeholder="เลขมิเตอร์" className={fieldInput + " font-mono tabular-nums"} />
            </div>
            <div className={fieldCard}>
              <label className={fieldLabel}>ค่าไฟรายเดือน (บาท)</label>
              <input type="number" inputMode="numeric" value={values.monthly_bill ?? ""} onChange={e => onChange({ monthly_bill: e.target.value })} placeholder="เช่น 3500" className={fieldInput + " font-mono tabular-nums"} />
            </div>
          </div>
        </div>
      )}

      {/* Spacer pushes buttons to bottom when content is short */}
      <div className="flex-1" />

      {/* Navigation */}
      <div className="flex gap-2 pt-2 lg:max-w-md">
        {subStep > 0 && (
          <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            ย้อนกลับ
          </button>
        )}
        {subStep < SUB_STEPS.length - 1 && (
          <button type="button" onClick={() => goTo(subStep + 1)} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        )}
        <button type="button" onClick={onSubmit} disabled={saving} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {saving ? "กำลังบันทึก…" : submitLabel}
        </button>
      </div>

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
  );
}
