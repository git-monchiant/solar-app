"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import CustomerWizard from "@/components/customer/CustomerWizard";
import LinePickerModal from "@/components/modal/LinePickerModal";
import ModalCloseButton from "@/components/ui/ModalCloseButton";

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
    project_id: "" as string | number | null, project_name: "",
    installation_address: "",
    customer_type: "", interested_package_id: "", note: "",
    source: "", payment_type: "", requirement: "",
    id_card_number: "", id_card_address: "",
    id_card_photo_url: null as string | null, house_reg_photo_url: null as string | null,
    utility_provider: "", ca_number: "", meter_number: "", monthly_bill: "",
  });

  useEffect(() => {
    apiFetch(`/api/leads/${leadId}`).then((lead) => {
      setForm({
        full_name: lead.full_name || "",
        phone: lead.phone || "",
        project_id: lead.project_id || "",
        project_name: lead.project_name || "",
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
    <div className="fixed inset-0 z-[70] md:flex md:items-center md:justify-center md:p-6">
      <div className="hidden md:block absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full h-full md:max-w-[90vw] md:max-h-[90vh] md:rounded-2xl overflow-y-auto md:animate-slide-up flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] flex items-center justify-between z-10 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate min-w-0">ข้อมูลลูกค้า{form.full_name ? ` — ${form.full_name}` : ""}</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-5 py-4 lg:px-10 flex-1 min-h-0">
            <CustomerWizard
              values={form}
              onChange={patch => setForm(prev => ({ ...prev, ...(patch as Record<string, unknown>) } as typeof prev))}
              onSubmit={handleSave}
              saving={saving}
              lineProfile={lineProfile}
              onLinkLine={() => setShowLinePicker(true)}
            />
          </div>
        )}
      </div>

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
    </div>
  );
}
