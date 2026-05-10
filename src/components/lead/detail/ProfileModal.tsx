"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import CustomerWizard from "@/components/customer/CustomerWizard";
import DocumentScanner, { type ScanFields } from "@/components/customer/DocumentScanner";
import LinePickerModal from "@/components/modal/LinePickerModal";
import ModalBase from "@/components/ui/ModalBase";

interface Props {
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "info" | "docs";

export default function ProfileModal({ leadId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [lineProfile, setLineProfile] = useState<{ display_name: string; picture_url: string | null } | null>(null);
  const [showLinePicker, setShowLinePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "", phone: "", email: "",
    project_id: "" as string | number | null, project_name: "", project_alias: "",
    installation_address: "",
    customer_type: "", interested_package_id: "", note: "",
    source: "", payment_type: "", requirement: "",
    id_card_number: "", id_card_address: "",
    id_card_photo_url: null as string | null, house_reg_photo_url: null as string | null,
    utility_provider: "", ca_number: "", meter_number: "", monthly_bill: "",
    customer_code: "", seeker_type: "", seeker_name: "",
    customer_interest: "", home_loan_status: "", project_note: "",
    house_number: "",
  });

  useEffect(() => {
    apiFetch(`/api/leads/${leadId}`).then((lead) => {
      setForm({
        full_name: lead.full_name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        project_id: lead.project_id || "",
        // The wizard's "โครงการ" text box is bound to project_name in our
        // form state, but for the lead profile we treat it as an *alias*
        // editor: prefer the existing alias, fall back to the COALESCEd
        // project_name (joined or free-text). On save the typed/picked value
        // gets written back to project_alias.
        project_name: lead.project_alias || lead.project_name || "",
        project_alias: lead.project_alias || "",
        installation_address: lead.installation_address || "",
        customer_type: lead.customer_type || "",
        interested_package_id: lead.interested_package_id ? String(lead.interested_package_id) : "",
        note: lead.note || "",
        source: lead.source || "",
        payment_type: lead.payment_type || "",
        requirement: lead.requirement || "",
        id_card_number: lead.id_card_number || "",
        id_card_address: lead.id_card_address || "",
        id_card_photo_url: lead.id_card_photo_url || null,
        house_reg_photo_url: lead.house_reg_photo_url || null,
        utility_provider: lead.utility_provider || "",
        ca_number: lead.ca_number || lead.survey_ca_number || "",
        meter_number: lead.meter_number || "",
        monthly_bill: lead.pre_monthly_bill ? String(lead.pre_monthly_bill) : "",
        customer_code: lead.customer_code || "",
        seeker_type: lead.seeker_type || "",
        seeker_name: lead.seeker_name || "",
        customer_interest: lead.customer_interest || "",
        home_loan_status: lead.home_loan_status || "",
        project_note: lead.project_note || "",
        house_number: lead.house_number || "",
      });
      if (lead.line_display_name) {
        setLineProfile({ display_name: lead.line_display_name, picture_url: lead.line_picture_url || null });
      }
      setLoading(false);
    }).catch(console.error);
  }, [leadId]);

  const handleSave = async () => {
    const missing: string[] = [];
    if (!form.full_name.trim()) missing.push("ชื่อ-นามสกุล");
    if (!form.phone.trim()) missing.push("เบอร์โทร");
    if (!form.email.trim()) missing.push("อีเมล");
    if (!form.house_number.trim()) missing.push("บ้านเลขที่");
    if (missing.length > 0) {
      // Switch to whichever tab holds the first missing field so it's visible.
      // info tab owns name/phone/house_number; docs tab owns email duplicate.
      setTab("info");
      setError("กรุณากรอก: " + missing.join(", "));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name ? form.full_name.slice(0, 200) : undefined,
          phone: form.phone || undefined,
          email: form.email ? form.email.slice(0, 200) : null,
          project_id: form.project_id ? parseInt(String(form.project_id)) : null,
          // The "โครงการ" input here edits the alias; whatever the user
          // typed/picked goes into project_alias. project_name (free-text
          // fallback) is cleared because alias supersedes it for display.
          project_alias: form.project_name?.trim() || null,
          project_name: null,
          installation_address: form.installation_address ? form.installation_address.slice(0, 500) : undefined,
          customer_type: form.customer_type || undefined,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
          note: form.note || undefined,
          source: form.source || undefined,
          payment_type: form.payment_type || undefined,
          requirement: form.requirement || undefined,
          id_card_number: form.id_card_number ? form.id_card_number.slice(0, 13) : undefined,
          id_card_address: form.id_card_address ? form.id_card_address.slice(0, 500) : undefined,
          id_card_photo_url: form.id_card_photo_url,
          house_reg_photo_url: form.house_reg_photo_url,
          customer_code: form.customer_code || null,
          seeker_type: form.seeker_type || null,
          seeker_name: form.seeker_name || null,
          customer_interest: form.customer_interest || null,
          home_loan_status: form.home_loan_status || null,
          project_note: form.project_note || null,
          house_number: form.house_number || null,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // OCR scanner pushes whatever Gemini found into the corresponding form
  // field — only fill blanks, never overwrite something the user already
  // typed (rescans should not clobber edits).
  const applyScan = (fields: ScanFields) => {
    setForm(prev => ({
      ...prev,
      full_name: prev.full_name || fields.full_name || prev.full_name,
      phone: prev.phone || fields.phone || prev.phone,
      id_card_number: prev.id_card_number || fields.id_card_number || prev.id_card_number,
      id_card_address: prev.id_card_address || fields.id_card_address || prev.id_card_address,
      installation_address: prev.installation_address || fields.installation_address || prev.installation_address,
    }));
  };

  // Match the underline-style tabs used on the lead detail page so the
  // ProfileModal feels consistent with the rest of the app.
  const tabBtn = (active: boolean) =>
    `px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${
      active ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"
    }`;

  return (
    <>
      <ModalBase
        title={
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </span>
            <span>{`ข้อมูลลูกค้า${form.full_name ? ` — ${form.full_name}` : ""}`}</span>
          </div>
        }
        onClose={onClose}
        size="xl"
        footer={!loading && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:bg-primary-dark transition-colors"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Tab bar — underline style, matches the rest of the app
                (lead detail, settings). Form state is shared so the Save
                button in the modal footer flushes both tabs at once. */}
            <div className="flex border-b border-gray-200 mb-4 -mx-5 px-5">
              <button type="button" onClick={() => setTab("info")} className={tabBtn(tab === "info")} style={{ minHeight: 0 }}>
                ข้อมูล
              </button>
              <button type="button" onClick={() => setTab("docs")} className={tabBtn(tab === "docs")} style={{ minHeight: 0 }}>
                เอกสาร
              </button>
            </div>

            {tab === "info" && (
              <CustomerWizard
                values={form}
                onChange={patch => setForm(prev => ({ ...prev, ...(patch as Record<string, unknown>) } as typeof prev))}
                onSubmit={handleSave}
                saving={saving}
                lineProfile={lineProfile}
                onLinkLine={() => setShowLinePicker(true)}
                hideSubmit
              />
            )}

            {tab === "docs" && (
              <DocumentTab
                form={form}
                onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
                onScan={applyScan}
              />
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
            )}
          </>
        )}
      </ModalBase>

      {showLinePicker && (
        <LinePickerModal
          target={{ type: "lead", id: leadId, label: form.full_name }}
          onClose={() => setShowLinePicker(false)}
          onLinked={(linked) => {
            setLineProfile(linked);
            onSaved();
          }}
        />
      )}
    </>
  );
}

// Receipt-info tab. Hosts the OCR scanner up top and the four fields used to
// issue receipts — kept close to the scanner so a single tap can fill them.
function DocumentTab({
  form,
  onChange,
  onScan,
}: {
  form: { full_name: string; email: string; id_card_number: string; id_card_address: string; installation_address: string };
  onChange: (patch: Partial<{ full_name: string; email: string; id_card_number: string; id_card_address: string; installation_address: string }>) => void;
  onScan: (fields: ScanFields) => void;
}) {
  const installMirrorsId = !!form.id_card_address && form.installation_address === form.id_card_address;

  return (
    <div className="lg:max-w-2xl mx-auto space-y-3">
      <DocumentScanner
        onResult={onScan}
        fields={["full_name", "id_card_number", "id_card_address", "installation_address"]}
        subtitle="บัตรประชาชน · ทะเบียนบ้าน · บิลค่าไฟ · ซองจดหมาย"
      />

      <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-3">
        <div className="text-sm font-bold text-gray-700 pb-2 border-b border-gray-100">ข้อมูลลูกค้าเพื่อออกใบเสร็จ</div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            ชื่อ-นามสกุล <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.full_name}
            onChange={e => onChange({ full_name: e.target.value })}
            className="w-full h-11 px-3 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            อีเมล <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={e => onChange({ email: e.target.value })}
            placeholder="example@mail.com"
            className="w-full h-11 px-3 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            เลขบัตรประชาชน <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.id_card_number}
            onChange={e => onChange({ id_card_number: e.target.value.slice(0, 13) })}
            placeholder="x-xxxx-xxxxx-xx-x"
            className="w-full h-11 px-3 rounded-lg border border-gray-200 text-base font-mono tabular-nums focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            ที่อยู่ตามบัตรประชาชน <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.id_card_address}
            onChange={e => onChange({ id_card_address: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              ที่อยู่ติดตั้ง <span className="text-red-500">*</span>
            </label>
            <label className="text-xs text-gray-600 inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-primary cursor-pointer"
                checked={installMirrorsId}
                onChange={(e) => {
                  // One-shot copy from id_card_address into installation_address
                  // when ticked. Untick lets the user edit independently — same
                  // behavior as PreSurveyStep so the two screens feel uniform.
                  if (e.target.checked) onChange({ installation_address: form.id_card_address });
                }}
              />
              เหมือนที่อยู่ตามบัตร
            </label>
          </div>
          <textarea
            value={form.installation_address}
            onChange={e => onChange({ installation_address: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
      </div>
    </div>
  );
}
