"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import LinePickerModal from "@/components/modal/LinePickerModal";
import ChannelPickerModal from "@/components/shared/ChannelPickerModal";
import { type ChannelValue } from "@/lib/constants/channels";
import { getSourceStyle } from "@/lib/source-tag";
import { LineIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";

// Inline (non-modal) customer edit form for the PreSurvey "ข้อมูลลูกค้า"
// sub-step. Layout mirrors the questionnaire tree in the Info tab —
// rounded card sections with icon + title header, then labeled inputs
// stacked inside. Auto-save on change (debounced 600ms).

interface Props {
  leadId: number;
  onSaved?: () => void;
}

interface FormState {
  full_name: string;
  phone: string;
  email: string;
  project_id: number | null;
  project_alias: string;
  installation_address: string;
  house_number: string;
  customer_type: string;
  source: string;
  tag: ChannelValue[];
}

const empty: FormState = {
  full_name: "", phone: "", email: "",
  project_id: null, project_alias: "",
  installation_address: "", house_number: "",
  customer_type: "", source: "",
  tag: [],
};

export default function InlineCustomerEdit({ leadId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [showLinePicker, setShowLinePicker] = useState(false);
  const [showChannelPicker, setShowChannelPicker] = useState<null | "source" | "tag">(null);
  const [lineProfile, setLineProfile] = useState<{ display_name: string; picture_url: string | null } | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstSave = useRef(true);

  useEffect(() => {
    apiFetch(`/api/leads/${leadId}`).then((lead) => {
      // Parse the tag column — may arrive as JSON string, plain string, or array.
      let tag: ChannelValue[] = [];
      if (Array.isArray(lead.tag)) tag = lead.tag as ChannelValue[];
      else if (typeof lead.tag === "string" && lead.tag) {
        try {
          const parsed = JSON.parse(lead.tag);
          if (Array.isArray(parsed)) tag = parsed as ChannelValue[];
        } catch { /* not JSON — leave empty */ }
      }
      setForm({
        full_name: lead.full_name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        project_id: lead.project_id ?? null,
        // Alias-first: the "โครงการ" box edits project_alias; writes back
        // on save (matches ProfileModal — see its comment for context).
        project_alias: lead.project_alias || lead.project_name || "",
        installation_address: lead.installation_address || "",
        house_number: lead.house_number || "",
        customer_type: lead.customer_type || "",
        source: lead.source || "",
        tag,
      });
      if (lead.line_display_name) {
        setLineProfile({ display_name: lead.line_display_name, picture_url: lead.line_picture_url || null });
      }
      setLoading(false);
    }).catch(console.error);
  }, [leadId]);

  const patch = (fields: Partial<FormState>) => setForm(prev => ({ ...prev, ...fields }));

  const savePatch = async () => {
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name ? form.full_name.slice(0, 200) : undefined,
          phone: form.phone || undefined,
          email: form.email ? form.email.slice(0, 200) : null,
          project_id: form.project_id ?? null,
          project_alias: form.project_alias?.trim() || null,
          project_name: null,
          installation_address: form.installation_address ? form.installation_address.slice(0, 500) : undefined,
          house_number: form.house_number || null,
          customer_type: form.customer_type || undefined,
          source: form.source || undefined,
          tag: form.tag.length > 0 ? JSON.stringify(form.tag) : null,
        }),
      });
      onSaved?.();
    } catch (e) { console.error("InlineCustomerEdit save failed:", e); }
  };

  useEffect(() => {
    if (loading) return;
    if (isFirstSave.current) { isFirstSave.current = false; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { savePatch(); saveTimerRef.current = null; }, 600);
    return () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Shared classes — same visual language as the Info-tab questionnaire
  // (rounded card, uppercase-tracked section title with icon, chip inputs).
  const sectionCls = "rounded-lg bg-white/60 border border-active/15 p-3";
  const sectionTitle = "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2";
  const sectionIconWrap = "w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0";
  const fieldLabel = "block text-xs text-gray-500 mb-1.5";
  const inputCls = "w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-active";
  const chipBtn = (selected: boolean) =>
    `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
      selected
        ? "bg-active text-white border-active shadow-sm shadow-active/20"
        : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
    }`;

  const sourceStyle = form.source ? getSourceStyle(form.source) : null;

  return (
    <div className="space-y-3">
      {/* ── Contact ───────────────────────────────────────────────────── */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><UserIcon className="w-4 h-4" /></span>
          ติดต่อ
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          <div className="md:col-span-7">
            <label className={fieldLabel}>ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
            <input type="text" value={form.full_name}
              onChange={e => patch({ full_name: e.target.value })}
              className={inputCls} />
          </div>
          {/* Contact card — tel / mail / LINE stacked as 3 rows inside a
              narrow 2/7-col card (compact business-card style). Label +
              icon on top, input below for each row. */}
          <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-2">
            <div>
              <label className={`${fieldLabel} flex items-center gap-1.5`}>
                <PhoneIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                เบอร์โทร <span className="text-red-500">*</span>
              </label>
              <input type="tel" value={form.phone}
                onChange={e => patch({ phone: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label className={`${fieldLabel} flex items-center gap-1.5`}>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                อีเมล <span className="text-red-500">*</span>
              </label>
              <input type="email" value={form.email}
                onChange={e => patch({ email: e.target.value })}
                placeholder="example@mail.com"
                className={inputCls} />
            </div>
            <div>
              <label className={`${fieldLabel} flex items-center gap-1.5`}>
                <LineIcon className="w-3.5 h-3.5 text-[#06C755]" />
                LINE
              </label>
              {lineProfile ? (
                <div className="flex items-center gap-2 h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm">
                  {lineProfile.picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lineProfile.picture_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <LineIcon className="w-4 h-4 text-emerald-600" />
                  )}
                  <span className="flex-1 truncate text-emerald-800">{lineProfile.display_name}</span>
                  <span className="text-xxs text-emerald-600 font-semibold">✓</span>
                </div>
              ) : (
                <button type="button" onClick={() => setShowLinePicker(true)}
                  className={`${inputCls} flex items-center justify-center gap-1.5 text-gray-500 hover:border-active/40 hover:text-active`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  เชื่อม LINE user
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Installation Address ─────────────────────────────────────── */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </span>
          ที่อยู่ติดตั้ง
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          <div className="md:col-span-2">
            <label className={fieldLabel}>บ้านเลขที่ <span className="text-red-500">*</span></label>
            <input type="text" value={form.house_number}
              onChange={e => patch({ house_number: e.target.value })}
              className={inputCls} />
          </div>
          <div className="md:col-span-5">
            <label className={fieldLabel}>โครงการ</label>
            <input type="text" value={form.project_alias}
              onChange={e => patch({ project_alias: e.target.value })}
              placeholder="เจ วัลล่า รังสิต-คลอง 1"
              className={inputCls} />
          </div>
          <div className="md:col-span-7">
            <label className={fieldLabel}>ที่อยู่</label>
            <textarea value={form.installation_address}
              onChange={e => patch({ installation_address: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-active resize-none" />
          </div>
        </div>
      </div>

      {/* ── Source / Customer Type ───────────────────────────────────── */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          </span>
          ที่มา / ประเภทลูกค้า
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          <div className="md:col-span-4">
            <label className={fieldLabel}>ที่มา (ช่องทางที่ลูกค้ารู้จักเรา) <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {sourceStyle ? (
                <button type="button" onClick={() => setShowChannelPicker("source")}
                  className={`h-7 px-2.5 rounded text-xxs font-bold uppercase tracking-wider ring-1 ring-inset ${sourceStyle.cls}`}
                  title="คลิกเพื่อเปลี่ยน">
                  {sourceStyle.label}
                </button>
              ) : (
                <button type="button" onClick={() => setShowChannelPicker("source")}
                  className="h-7 px-3 rounded text-xxs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200">
                  เลือกที่มา
                </button>
              )}
              {form.tag.map(code => {
                const style = getSourceStyle(code);
                return (
                  <button key={code} type="button"
                    onClick={() => patch({ tag: form.tag.filter(t => t !== code) })}
                    title={`คลิกเพื่อลบ ${style.label}`}
                    className={`h-7 pl-2.5 pr-1.5 rounded text-xxs font-bold uppercase tracking-wider ring-1 ring-inset flex items-center gap-1 ${style.cls}`}>
                    {style.label}
                    <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                );
              })}
              <button type="button" onClick={() => setShowChannelPicker("tag")}
                title="เพิ่มช่องทางเพิ่มเติม"
                className="w-7 h-7 rounded border border-dashed border-gray-300 text-gray-400 hover:border-active hover:text-active flex items-center justify-center">
                <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="md:col-span-3">
            <label className={fieldLabel}>ประเภทลูกค้า <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-4 h-8">
              {([
                { v: "new",     label: "New" },
                { v: "upgrade", label: "Upgrade" },
              ] as const).map(opt => (
                <label key={opt.v} className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                  <input type="radio"
                    name="customer_type"
                    value={opt.v}
                    checked={form.customer_type === opt.v}
                    onChange={() => patch({ customer_type: opt.v })}
                    className="w-4 h-4 accent-active cursor-pointer" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showLinePicker && (
        <LinePickerModal
          target={{ type: "lead", id: leadId, label: form.full_name || "" }}
          onClose={() => setShowLinePicker(false)}
          onLinked={(linked) => {
            setLineProfile(linked);
            onSaved?.();
          }}
        />
      )}

      {showChannelPicker && (
        <ChannelPickerModal
          onClose={() => setShowChannelPicker(null)}
          onPick={(code) => {
            if (showChannelPicker === "source") {
              patch({ source: code });
            } else {
              // Add to secondary channels (tag) if not already there or the
              // primary. Silently ignore duplicates so the picker feels
              // idempotent.
              if (code !== form.source && !form.tag.includes(code)) {
                patch({ tag: [...form.tag, code] });
              }
            }
            setShowChannelPicker(null);
          }}
          title={showChannelPicker === "source" ? "เลือกที่มา" : "เพิ่มช่องทาง"}
        />
      )}
    </div>
  );
}
