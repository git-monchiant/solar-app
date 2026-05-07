"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import CustomerWizard from "@/components/customer/CustomerWizard";
import LinePickerModal from "@/components/modal/LinePickerModal";
import ModalBase from "@/components/ui/ModalBase";

interface Props {
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProfileModal({ leadId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lineProfile, setLineProfile] = useState<{ display_name: string; picture_url: string | null } | null>(null);
  const [showLinePicker, setShowLinePicker] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "",
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
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name ? form.full_name.slice(0, 200) : undefined,
          phone: form.phone || undefined,
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
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalBase
        title={`ข้อมูลลูกค้า${form.full_name ? ` — ${form.full_name}` : ""}`}
        onClose={onClose}
        size="xl"
        footer={!loading && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
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
