"use client";

import { apiFetch } from "@/lib/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import CustomerWizard from "@/components/customer/CustomerWizard";

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

  const handleSubmit = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id ? parseInt(String(form.project_id)) : null,
          project_name_input: !form.project_id && form.project_name?.trim() ? form.project_name.trim() : null,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
        }),
      });
      router.push("/pipeline");
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto pb-8 max-w-2xl lg:max-w-full">
      <Header title="New Lead" backHref="/pipeline" />
      <div className="p-3 md:p-6 lg:px-10 min-h-[calc(100dvh-64px)]">
        <CustomerWizard
          values={form}
          onChange={patch => setForm(prev => ({ ...prev, ...(patch as Record<string, unknown>) } as typeof prev))}
          onSubmit={handleSubmit}
          saving={saving}
        />
      </div>
    </div>
  );
}
