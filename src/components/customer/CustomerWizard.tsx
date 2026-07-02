"use client";
import { PlusIcon } from "@/components/ui/icons";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ErrorPopup from "@/components/ui/ErrorPopup";
import LineIcon from "@/components/icons/LineIcon";
import { CHANNEL_BY_CODE, type ChannelCode } from "@/lib/constants/channels";
import { getSourceStyle } from "@/lib/source-tag";
import ChannelPickerModal from "@/components/shared/ChannelPickerModal";

export interface CustomerWizardValues {
  full_name?: string;
  phone?: string;
  email?: string;
  project_id?: string | number | null;
  project_name?: string;
  installation_address?: string;
  customer_type?: string;
  interested_package_id?: string;
  note?: string;
  source?: string;
  /** Additional touchpoints (mirrors prospects.tag). Stored as JSON string in
   * the DB but accepted here as either array or pre-stringified JSON. */
  tag?: string | string[] | null;
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
  /** When the wizard is embedded in a Modal that owns the footer/save button,
   * suppress the wizard's internal save button. Caller should wire onSubmit
   * via the Modal's footer slot. */
  hideSubmit?: boolean;
}

// Standard short codes — match the values used by import_leads_merge.mjs and
// the seeker→lead sync. Storing codes (not Thai labels) avoids drift between
// chip-selected state and DB value when wording changes.
const CUSTOMER_TYPES = [
  { value: "new", label: "New" },
  { value: "upgrade", label: "Upgrade" },
];
const chipBtn = (selected: boolean) =>
  `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const fieldCard = "rounded-lg bg-white border border-gray-200 p-3";
const fieldInput = "w-full h-11 px-3 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors";
const fieldTextarea = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors resize-none";

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
          <FormField label="เบอร์โทร" required>
            <input
              type="tel"
              value={values.phone ?? ""}
              onChange={e => onChange({ phone: e.target.value })}
              placeholder="08x-xxx-xxxx"
              className={fieldInput + " font-mono tabular-nums"}
            />
          </FormField>
          <FormField label="อีเมล" required>
            <input
              type="email"
              value={values.email ?? ""}
              onChange={e => onChange({ email: e.target.value })}
              placeholder="example@mail.com"
              className={fieldInput}
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
                  <span className={`text-xxs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${linePending ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
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
                  <PlusIcon className="w-4 h-4" strokeWidth={2} />
                  เชื่อม LINE user
                </button>
              ) : null}
            </FormField>
          )}
        </FormCard>

        <FormCard title="ที่อยู่ติดตั้ง">
          <div className="grid grid-cols-3 gap-2">
            <FormField label="บ้านเลขที่" required>
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

      {/* Row 2: ที่มา / ประเภท — chip system mirrors the seeker prospect modal:
       * - source = first-touch (immutable once set; clicking + opens the picker
       *   when blank, otherwise just acts as the label chip)
       * - tag = editable JSON array of additional touchpoints, each chip has ×
       *   to delete, + button to add via ChannelPickerModal */}
      <ChannelTagPicker values={values} onChange={onChange} />
    </div>
  );
}

// ChannelTagPicker — replaces the legacy SOURCES grid. Mirrors the seeker
// prospect modal so the lead UX matches: source chip + editable tag chips +
// add button, with customer_type kept as a side-by-side toggle.
function ChannelTagPicker({
  values,
  onChange,
}: {
  values: CustomerWizardValues;
  onChange: (patch: Partial<CustomerWizardValues>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState<null | "source" | "tag">(null);

  // tag may arrive as JSON string (from API) or array (in-memory). Normalize.
  const tagCodes: ChannelCode[] = (() => {
    if (Array.isArray(values.tag)) return values.tag.filter(Boolean) as ChannelCode[];
    if (typeof values.tag === "string" && values.tag) {
      try {
        const parsed = JSON.parse(values.tag);
        if (Array.isArray(parsed)) return parsed.filter(Boolean) as ChannelCode[];
      } catch {}
    }
    return [];
  })();

  const setTagCodes = (next: ChannelCode[]) => onChange({ tag: next });
  const removeTag = (c: ChannelCode) => setTagCodes(tagCodes.filter((x) => x !== c));
  const addTag = (c: ChannelCode) => {
    if (c === values.source) return; // already the first-touch
    if (tagCodes.includes(c)) return;
    setTagCodes([...tagCodes, c]);
  };

  const chipBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    minHeight: 28,
    maxHeight: 28,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 0,
    boxSizing: "border-box",
    lineHeight: 1,
    flexShrink: 0,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <FormCard title="ที่มา / ประเภทลูกค้า">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FormField label="ที่มา (ช่องทางที่ลูกค้ารู้จักเรา)">
          <div className="flex items-center gap-1.5 flex-wrap">
            {values.source ? (() => {
              const s = getSourceStyle(values.source);
              return (
                <span
                  title="ที่มาแรก — แก้ไม่ได้"
                  className={s.cls}
                  style={{ ...chipBase, paddingLeft: 10, paddingRight: 10 }}
                >
                  {s.label}
                </span>
              );
            })() : (
              <button
                type="button"
                onClick={() => setPickerOpen("source")}
                className="text-gray-500 bg-gray-100 hover:bg-gray-200 px-3"
                style={{ ...chipBase, fontWeight: 600 }}
              >
                เลือกที่มา
              </button>
            )}
            {tagCodes.map((c) => CHANNEL_BY_CODE[c] && (() => {
              const s = getSourceStyle(c);
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => removeTag(c)}
                  title={`คลิกเพื่อลบ ${s.label}`}
                  className={`hover:opacity-80 ${s.cls}`}
                  style={{ ...chipBase, paddingLeft: 10, paddingRight: 6, gap: 4 }}
                >
                  {s.label}
                  <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              );
            })())}
            {values.source && (
              <button
                type="button"
                onClick={() => setPickerOpen("tag")}
                title="เพิ่ม Touchpoint"
                className="text-gray-500 bg-gray-100 hover:bg-gray-200"
                style={{ ...chipBase, width: 28, minWidth: 28, maxWidth: 28, paddingLeft: 0, paddingRight: 0, fontSize: 0 }}
              >
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ display: "block" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
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

      {pickerOpen && (
        <ChannelPickerModal
          onClose={() => setPickerOpen(null)}
          onPick={(code) => {
            if (pickerOpen === "source") onChange({ source: code });
            else addTag(code as ChannelCode);
            setPickerOpen(null);
          }}
        />
      )}
    </FormCard>
  );
}

// `mode` prop is accepted for backwards compatibility (callers still pass it)
// but ignored — both create and edit render the same compact form now.
export default function CustomerWizard({ values, onChange, onSubmit, submitLabel = "บันทึก", saving, lineProfile, linePending, onLinkLine, hideSubmit }: Props) {
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

      {/* Footer save button — only when the wizard owns the chrome. When
          embedded in a Modal that handles the footer slot, set hideSubmit=true
          and wire onSubmit through the Modal footer button instead. */}
      {!hideSubmit && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <button type="button" onClick={onSubmit} disabled={saving} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? "กำลังบันทึก…" : submitLabel}
          </button>
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
  );
}
