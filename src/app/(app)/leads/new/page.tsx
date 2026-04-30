"use client";

import { apiFetch } from "@/lib/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import CustomerWizard from "@/components/customer/CustomerWizard";
import LinePickerModal from "@/components/modal/LinePickerModal";

export default function NewLeadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "", project_id: "" as string | number | null, project_name: "",
    installation_address: "",
    customer_type: "ลูกค้าใหม่ยังไม่มีโซล่า", interested_package_id: "", note: "",
    source: "walk-in", payment_type: "", requirement: "",
    id_card_number: "", id_card_address: "",
    id_card_photo_url: null as string | null, house_reg_photo_url: null as string | null,
    utility_provider: "", ca_number: "", meter_number: "", monthly_bill: "",
  });
  const [lineProfile, setLineProfile] = useState<{ display_name: string; picture_url: string | null } | null>(null);
  const [linePendingId, setLinePendingId] = useState<number | null>(null);
  const [showLinePicker, setShowLinePicker] = useState(false);

  const handleSubmit = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      const result = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id ? parseInt(String(form.project_id)) : null,
          project_name_input: !form.project_id && form.project_name?.trim() ? form.project_name.trim() : null,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
        }),
      });
      // Link picked LINE user to the freshly-created lead.
      if (linePendingId && result?.id) {
        await apiFetch(`/api/line-users/${linePendingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: result.id }),
        }).catch(console.error);
      }
      router.push(result?.id ? `/leads/${result.id}` : "/pipeline");
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto pb-8 max-w-2xl">
      <Header title="New Lead" backHref="/pipeline" />
      <div className="p-3 md:p-6 lg:px-10 min-h-[calc(100dvh-64px)]">
        <CustomerWizard
          values={form}
          onChange={patch => setForm(prev => ({ ...prev, ...(patch as Record<string, unknown>) } as typeof prev))}
          onSubmit={handleSubmit}
          saving={saving}
          mode="create"
          lineProfile={lineProfile}
          linePending={!!lineProfile}
          onLinkLine={() => setShowLinePicker(true)}
        />
      </div>
      {showLinePicker && (
        <LinePickerModal
          target={{ type: "draft", label: form.full_name?.trim() || "ลูกค้าใหม่" }}
          onClose={() => setShowLinePicker(false)}
          onLinked={(linked) => {
            setLineProfile({ display_name: linked.display_name, picture_url: linked.picture_url });
            setLinePendingId(linked.id);
          }}
        />
      )}
    </div>
  );
}
